import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gmailSyncState } from "#db";
import { createApplicationsRepository } from "../applications/repository.ts";
import { createContactsRepository } from "../contacts/repository.ts";
import { createCvsRepository } from "../cvs/repository.ts";
import { createEmailDraftsRepository } from "../emails/repository.ts";
import { createEmailSender } from "../emails/send.ts";
import { FAKE_GMAIL_ADDRESS, type FakeGoogle, startFakeGoogle } from "../test/fake-google.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createGmailConnection, type GmailConnection } from "./connection.ts";
import { createReplySync, SYNC_WINDOW_DAYS } from "./sync.ts";
import { createSyncRepository } from "./sync-repository.ts";
import { gmailSyncRoutes } from "./sync-routes.ts";
import { createTokenStore } from "./token-store.ts";

const MINUTE = 60_000;

let iso: IsolatedDb;
let google: FakeGoogle;
let tokenDir: string;
let gmail: GmailConnection;
const applications = () => createApplicationsRepository(iso.db);

const syncWith = (connection: GmailConnection | null) =>
  createReplySync({
    gmail: connection,
    repo: createSyncRepository(iso.db),
    applications: applications(),
    intervalMinutes: 15,
  });

beforeAll(async () => {
  iso = await createIsolatedDb();
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE gmail_sync_state, outbound_emails, application_contacts, contacts, application_events, applications, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
  google = await startFakeGoogle();
  tokenDir = await mkdtemp(path.join(tmpdir(), "apply-sync-"));
  gmail = createGmailConnection({
    config: {
      clientId: "cliente-prueba",
      clientSecret: "secreto-prueba",
      tokenDir,
      authUrl: google.authUrl,
      tokenUrl: google.tokenUrl,
      apiRootUrl: google.url,
    },
    store: createTokenStore(tokenDir),
  });
  expect((await fetch((await gmail.start()).authUrl)).status).toBe(200);
});

afterEach(async () => {
  gmail.close();
  await google.close();
  await rm(tokenDir, { recursive: true, force: true });
});

/** Envía un correo de postulación por el flujo real (#21): deja `thread_id` y `sent_at`. */
async function sentApplication() {
  const vacancy = await createVacanciesRepository(iso.db).create(newVacancy());
  const cvs = createCvsRepository(iso.db);
  const cv = await cvs.create({
    vacancyId: vacancy.id,
    title: "Backend",
    markdown: "# Ana Pérez",
    language: "es",
  });
  const drafts = createEmailDraftsRepository(iso.db);
  const draft = await drafts.replaceForCv({
    cvId: cv.id,
    to: "talento@acme.example",
    subject: "Postulación",
    body: "Hola",
    language: "es",
  });
  const sender = createEmailSender({
    repo: drafts,
    gmail,
    getCv: (id) => cvs.get(id),
    renderPdf: async () => Buffer.from("%PDF-1.7 %%EOF"),
  });
  const outcome = await sender.send(draft.id);
  if (outcome.kind !== "ok" || !outcome.draft.applicationId || !outcome.draft.sentAt) {
    throw new Error(`El envío de prueba no salió: ${outcome.kind}`);
  }
  const [message] = google.sent;
  if (!message) throw new Error("Gmail falso no registró el envío");
  return {
    applicationId: outcome.draft.applicationId,
    sentAt: new Date(outcome.draft.sentAt),
    threadId: message.threadId,
  };
}

const autoEvents = async (applicationId: string) =>
  ((await applications().timeline(applicationId))?.events ?? []).filter(
    (e) => e.source === "auto" && e.type === "contacted",
  );

describe("sincronización de respuestas con Gmail (#22)", () => {
  it("AC-001: una respuesta en el hilo crea un evento contacted automático por email", async () => {
    const sent = await sentApplication();
    const repliedAt = sent.sentAt.getTime() + 5 * MINUTE;
    google.inbox.push({
      id: "reply-1",
      threadId: sent.threadId,
      from: "Laura Gómez <laura@acme.example>",
      internalDate: repliedAt,
    });

    const outcome = await syncWith(gmail).run();

    expect(outcome).toMatchObject({ state: "synced", recorded: 1 });
    expect(google.threadRequests).toEqual([sent.threadId]);
    const [event, ...rest] = await autoEvents(sent.applicationId);
    expect(rest).toEqual([]);
    expect(event).toMatchObject({
      type: "contacted",
      source: "auto",
      channel: "email",
      gmailMessageId: "reply-1",
      occurredAt: new Date(repliedAt).toISOString(),
    });
    expect((await applications().get(sent.applicationId))?.status).toBe("contacted");
  });

  it("AC-002: sincronizar otra vez con los mismos mensajes no crea eventos nuevos", async () => {
    const sent = await sentApplication();
    google.inbox.push({
      id: "reply-1",
      threadId: sent.threadId,
      from: "laura@acme.example",
      internalDate: sent.sentAt.getTime() + MINUTE,
    });
    const sync = syncWith(gmail);

    expect(await sync.run()).toMatchObject({ state: "synced", recorded: 1 });
    expect(await sync.run()).toMatchObject({ state: "synced", recorded: 0 });
    expect(await autoEvents(sent.applicationId)).toHaveLength(1);
  });

  it("AC-003: el propio envío, los rebotes y lo anterior al envío no se registran", async () => {
    const sent = await sentApplication();
    google.inbox.push(
      {
        id: "bounce",
        threadId: sent.threadId,
        from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
        internalDate: sent.sentAt.getTime() + MINUTE,
      },
      {
        id: "postmaster",
        threadId: sent.threadId,
        from: "postmaster@acme.example",
        internalDate: sent.sentAt.getTime() + MINUTE,
      },
      {
        id: "mine",
        threadId: sent.threadId,
        from: `Ana <${FAKE_GMAIL_ADDRESS}>`,
        internalDate: sent.sentAt.getTime() + MINUTE,
      },
      {
        id: "old",
        threadId: sent.threadId,
        from: "laura@acme.example",
        internalDate: sent.sentAt.getTime() - MINUTE,
      },
    );

    expect(await syncWith(gmail).run()).toMatchObject({ state: "synced", recorded: 0 });
    expect(await autoEvents(sent.applicationId)).toEqual([]);
  });

  it("AC-004: busca correos del contacto con from: y after: con el epoch del envío", async () => {
    const sent = await sentApplication();
    const contact = await createContactsRepository(iso.db).addToApplication(sent.applicationId, {
      name: "Laura Gómez",
      email: "Laura@ACME.example",
    });
    if (!contact) throw new Error("No se vinculó el contacto");
    google.inbox.push(
      {
        id: "new-thread",
        threadId: "other-thread",
        from: "Laura Gómez <laura@acme.example>",
        internalDate: sent.sentAt.getTime() + MINUTE,
      },
      {
        id: "before-send",
        threadId: "older-thread",
        from: "laura@acme.example",
        internalDate: sent.sentAt.getTime() - 60 * MINUTE,
      },
    );

    expect(await syncWith(gmail).run()).toMatchObject({ state: "synced", recorded: 1 });

    const epoch = Math.floor(sent.sentAt.getTime() / 1000);
    expect(google.searches).toContain(`from:laura@acme.example after:${epoch}`);
    const [event] = await autoEvents(sent.applicationId);
    expect(event).toMatchObject({ gmailMessageId: "new-thread", contactId: contact.id });
  });

  it("una respuesta en el hilo de un contacto conocido queda asociada a ese contacto", async () => {
    const sent = await sentApplication();
    const contact = await createContactsRepository(iso.db).addToApplication(sent.applicationId, {
      name: "Laura Gómez",
      email: "laura@acme.example",
    });
    google.inbox.push({
      id: "reply-1",
      threadId: sent.threadId,
      from: "Laura <LAURA@acme.example>",
      internalDate: sent.sentAt.getTime() + MINUTE,
    });

    // El mismo mensaje sale del hilo y de la búsqueda del contacto: se registra una vez.
    expect(await syncWith(gmail).run()).toMatchObject({ state: "synced", recorded: 1 });
    const [event, ...rest] = await autoEvents(sent.applicationId);
    expect(rest).toEqual([]);
    expect(event?.contactId).toBe(contact?.id);
  });

  it("un correo enviado fuera de la ventana de detección no se revisa", async () => {
    const sent = await sentApplication();
    const now = () => new Date(sent.sentAt.getTime() + (SYNC_WINDOW_DAYS * 24 * 60 + 1) * MINUTE);
    const sync = createReplySync({
      gmail,
      repo: createSyncRepository(iso.db),
      applications: applications(),
      intervalMinutes: 15,
      now,
    });
    expect(await sync.run()).toMatchObject({ state: "synced", recorded: 0 });
    expect(google.threadRequests).toEqual([]);
  });

  it("AC-005: sin Gmail configurado no llama a la API y no falla", async () => {
    await sentApplication();
    const tokenCalls = google.tokenRequests.length;
    expect(await syncWith(null).run()).toEqual({ state: "skipped", reason: "not_configured" });
    expect(google.tokenRequests).toHaveLength(tokenCalls);
    expect(google.threadRequests).toEqual([]);
  });

  it("AC-005: con reauth pendiente no vuelve a llamar a Google y no falla", async () => {
    await sentApplication();
    google.refreshMode = "invalid_grant";
    const sync = syncWith(gmail);
    expect(await sync.run()).toEqual({ state: "skipped", reason: "reauth_required" });
    const tokenCalls = google.tokenRequests.length;
    expect(await sync.run()).toEqual({ state: "skipped", reason: "reauth_required" });
    expect(google.tokenRequests).toHaveLength(tokenCalls);
    expect(google.threadRequests).toEqual([]);
  });

  it("AC-006: gmail_sync_state guarda la última sincronización y no contiene tokens", async () => {
    await sentApplication();
    const sync = syncWith(gmail);
    expect(await sync.status()).toEqual({ lastSyncedAt: null, intervalMinutes: 15 });

    const outcome = await sync.run();

    const rows = await iso.db.select().from(gmailSyncState);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ account: FAKE_GMAIL_ADDRESS, historyId: null });
    expect(outcome).toMatchObject({ lastSyncedAt: rows[0]?.lastSyncedAt?.toISOString() });
    expect(JSON.stringify(rows)).not.toMatch(/fake-refresh|fake-access|secreto/);
    expect(await sync.status()).toEqual({
      lastSyncedAt: rows[0]?.lastSyncedAt?.toISOString(),
      intervalMinutes: 15,
    });

    await sync.run();
    expect(await iso.db.select().from(gmailSyncState)).toHaveLength(1);
  });

  it("un fallo de Gmail se propaga, no guarda avance y la siguiente corrida vuelve a intentar", async () => {
    await sentApplication();
    google.failReads = true;
    const sync = syncWith(gmail);

    await expect(sync.run()).rejects.toThrow();
    expect(await sync.status()).toEqual({ lastSyncedAt: null, intervalMinutes: 15 });
    const failedReads = google.threadRequests.length;

    google.failReads = false;
    expect(await sync.run()).toMatchObject({ state: "synced", recorded: 0 });
    expect(google.threadRequests).toHaveLength(failedReads + 1);
  });

  it("dos sincronizaciones a la vez comparten la misma corrida", async () => {
    const sent = await sentApplication();
    google.inbox.push({
      id: "reply-1",
      threadId: sent.threadId,
      from: "laura@acme.example",
      internalDate: sent.sentAt.getTime() + MINUTE,
    });
    const sync = syncWith(gmail);
    const [a, b] = await Promise.all([sync.run(), sync.run()]);
    expect(a).toBe(b);
    expect(google.threadRequests).toHaveLength(1);
  });
});

describe("rutas /gmail/sync", () => {
  const appWith = (connection: GmailConnection | null) =>
    new Hono().basePath("/api").route("/", gmailSyncRoutes({ sync: syncWith(connection) }));

  it("POST sincroniza y GET devuelve la última sincronización", async () => {
    const app = appWith(gmail);
    const before = await app.request("/api/gmail/sync");
    expect(await before.json()).toEqual({ lastSyncedAt: null, intervalMinutes: 15 });

    const res = await app.request("/api/gmail/sync", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ state: "synced", recorded: 0 });

    const after = await app.request("/api/gmail/sync");
    expect(await after.json()).toEqual({ lastSyncedAt: body.lastSyncedAt, intervalMinutes: 15 });
  });

  it("POST sin Gmail configurado responde 200 con skipped", async () => {
    const res = await appWith(null).request("/api/gmail/sync", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "skipped", reason: "not_configured" });
  });
});
