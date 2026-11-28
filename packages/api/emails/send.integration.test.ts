import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { outboundEmails } from "@apply/db";
import { EMAIL_STATUSES, type EmailDraft } from "@apply/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApplicationsRepository } from "../applications/repository.ts";
import { createCvsRepository } from "../cvs/repository.ts";
import { createGmailConnection, type GmailConnection } from "../gmail/connection.ts";
import { createTokenStore } from "../gmail/token-store.ts";
import { type FakeGoogle, startFakeGoogle } from "../test/fake-google.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createEmailDraftsRepository } from "./repository.ts";
import { createEmailSender } from "./send.ts";
import { emailSendRoutes } from "./send-routes.ts";

const draftSchema: z.ZodType<EmailDraft> = z.strictObject({
  id: z.string(),
  cvId: z.string(),
  to: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  language: z.enum(["es", "en"]),
  status: z.enum(EMAIL_STATUSES),
  sentAt: z.iso.datetime().nullable(),
  applicationId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const PDF = Buffer.from("%PDF-1.7 CV de Ana Pérez %%EOF");
const SECRET_BODY = "Cuerpo privado que nunca va a los logs";
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let iso: IsolatedDb;
let google: FakeGoogle;
let tokenDir: string;
let gmail: GmailConnection;
let app: Hono;
let renderPdf: (markdown: string, title: string) => Promise<Uint8Array>;
const cvs = () => createCvsRepository(iso.db);
const applications = () => createApplicationsRepository(iso.db);
const drafts = () => createEmailDraftsRepository(iso.db);

function appWith(connection: GmailConnection | null) {
  return new Hono().basePath("/api").route(
    "/",
    emailSendRoutes({
      sender: createEmailSender({
        repo: drafts(),
        gmail: connection,
        getCv: (id) => cvs().get(id),
        renderPdf: (markdown, title) => renderPdf(markdown, title),
      }),
    }),
  );
}

beforeAll(async () => {
  iso = await createIsolatedDb();
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE outbound_emails, application_events, applications, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
  renderPdf = async () => PDF;
  google = await startFakeGoogle();
  tokenDir = await mkdtemp(path.join(tmpdir(), "apply-send-"));
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
  // El usuario ya conectó su cuenta (#11): el Google falso aprueba el consentimiento solo.
  expect((await fetch((await gmail.start()).authUrl)).status).toBe(200);
  app = appWith(gmail);
});

afterEach(async () => {
  vi.restoreAllMocks();
  gmail.close();
  await google.close();
  await rm(tokenDir, { recursive: true, force: true });
});

const post = (url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const send = (id: string, body: unknown = { confirmed: true }) =>
  post(`/email-drafts/${id}/send`, body);

async function draftFor(to: string | null = "talento@example.com") {
  const vacancy = await createVacanciesRepository(iso.db).create(newVacancy());
  const cv = await cvs().create({
    vacancyId: vacancy.id,
    title: "Backend",
    markdown: "# Ana Pérez\n\nIngeniera backend.",
    language: "es",
  });
  const draft = await drafts().replaceForCv({
    cvId: cv.id,
    to,
    subject: "Postulación: Ingeniera Backend",
    body: `Hola Laura,\n\n${SECRET_BODY}`,
    language: "es",
  });
  return { vacancy, cv, draft };
}

const row = async (id: string) => {
  const [found] = await iso.db
    .select()
    .from(outboundEmails)
    .where(eq(outboundEmails.id, Number(id)));
  return found;
};

async function json(res: Response) {
  return draftSchema.parse(await res.json());
}

describe("POST /email-drafts/:id/send", () => {
  it.each([[{}], [{ confirmed: false }], ["no es json"], [{ confirmed: "true" }]])(
    "AC-002: sin confirmación explícita (%j) responde 400 y no llama a Gmail",
    async (body) => {
      const { draft } = await draftFor();
      const tokenCalls = google.tokenRequests.length;
      const res = await send(draft.id, body);
      expect(res.status).toBe(400);
      expect(google.tokenRequests).toHaveLength(tokenCalls);
      expect(google.sent).toEqual([]);
      expect((await row(draft.id))?.status).toBe("draft");
    },
  );

  it("AC-003: sin destinatario responde 400 y no llama a Gmail", async () => {
    const { draft } = await draftFor(null);
    const tokenCalls = google.tokenRequests.length;
    const res = await send(draft.id);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining("destinatario") });
    expect(google.tokenRequests).toHaveLength(tokenCalls);
    expect(google.sent).toEqual([]);
    expect((await row(draft.id))?.status).toBe("draft");
  });

  it("404 si el borrador no existe", async () => {
    expect((await send("999")).status).toBe(404);
    expect((await send("abc")).status).toBe(404);
  });

  it("409 si Gmail no está configurado, sin tocar el borrador", async () => {
    const { draft } = await draftFor();
    app = appWith(null);
    const res = await send(draft.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringContaining("GOOGLE_CLIENT_ID") });
    expect((await row(draft.id))?.status).toBe("draft");
  });

  it("AC-004: persiste sending y el Message-ID antes de messages.send, y los ids justo después", async () => {
    const { draft } = await draftFor();
    let during: Awaited<ReturnType<typeof row>> | undefined;
    google.beforeSend = async () => {
      during = await row(draft.id);
    };

    const res = await send(draft.id);
    expect(res.status).toBe(200);
    const sent = await json(res);

    expect(during).toMatchObject({ status: "sending", gmailId: null, sentAt: null });
    expect(during?.messageIdHeader).toMatch(/^<apply-[0-9a-f-]{36}@apply\.local>$/);
    expect(google.sent).toHaveLength(1);
    expect(google.sent[0]?.messageId).toBe(during?.messageIdHeader);

    const after = await row(draft.id);
    expect(after).toMatchObject({
      status: "sent",
      gmailId: "fake-msg-1",
      threadId: "fake-thread-1",
      messageIdHeader: during?.messageIdHeader,
    });
    expect(sent).toMatchObject({
      id: draft.id,
      status: "sent",
      sentAt: after?.sentAt?.toISOString(),
    });
  });

  it("AC-007: guarda el PDF exacto con su sha256 y registra applied por email con la fecha de envío", async () => {
    const { draft, cv, vacancy } = await draftFor();
    const calls: [string, string][] = [];
    renderPdf = async (markdown, title) => {
      calls.push([markdown, title]);
      return PDF;
    };
    const sent = await json(await send(draft.id));
    expect(calls).toEqual([[cv.markdown, cv.title]]);

    const stored = await row(draft.id);
    expect(stored?.pdf).toEqual(PDF);
    expect(stored?.pdfSha256).toBe(sha256(PDF));
    // El adjunto que salió es el mismo PDF guardado.
    const raw = Buffer.from(google.sent[0]?.raw ?? "", "base64url").toString("utf8");
    expect(raw).toContain('filename="CV-ana-perez-backend.pdf"');
    expect(raw).toContain(PDF.toString("base64"));
    expect(raw).toMatch(/^To: talento@example\.com\r$/m);

    expect(sent.applicationId).not.toBeNull();
    const timeline = await applications().timeline(sent.applicationId ?? "");
    expect(timeline?.application).toMatchObject({
      vacancyId: vacancy.id,
      cvId: cv.id,
      status: "applied",
    });
    expect(timeline?.events).toEqual([
      expect.objectContaining({
        type: "applied",
        channel: "email",
        source: "auto",
        occurredAt: sent.sentAt,
        gmailMessageId: "fake-msg-1",
      }),
    ]);
  });

  it("es idempotente: reenviar un correo ya enviado no llama a messages.send", async () => {
    const { draft } = await draftFor();
    const first = await json(await send(draft.id));
    const again = await send(draft.id);
    expect(again.status).toBe(200);
    expect(await json(again)).toEqual(first);
    expect(google.sent).toHaveLength(1);
    expect(await applications().list()).toHaveLength(1);
  });

  it("dos envíos simultáneos mandan un solo correo", async () => {
    const { draft } = await draftFor();
    await Promise.all([send(draft.id), send(draft.id)]);
    expect(google.sent).toHaveLength(1);
    expect((await row(draft.id))?.status).toBe("sent");
    expect(await applications().list()).toHaveLength(1);
  });

  it("un correo enviado ya no se puede editar", async () => {
    const { draft } = await draftFor();
    await send(draft.id);
    await expect(
      drafts().update(draft.id, { to: "otro@example.com", subject: "x", body: "y" }),
    ).rejects.toThrow(/ya no es un borrador/);
  });
});

describe("envío ambiguo y dedupe (AC-005)", () => {
  it("si la respuesta se pierde queda sending; reintentar lo encuentra y no reenvía", async () => {
    const { draft } = await draftFor();
    google.sendMode = "drop";
    const lost = await send(draft.id);
    expect(lost.status).toBe(202);
    expect(await json(lost)).toMatchObject({ status: "sending", sentAt: null });
    expect(google.sent).toHaveLength(1);

    google.sendMode = "ok";
    const res = await send(draft.id);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ status: "sent" });
    expect(google.sent).toHaveLength(1);
    expect(google.searches).toEqual([`rfc822msgid:${google.sent[0]?.messageId?.slice(1, -1)}`]);
    expect(await row(draft.id)).toMatchObject({ gmailId: "fake-msg-1", threadId: "fake-thread-1" });
    expect(await applications().list()).toHaveLength(1);
  });

  it("si el dedupe no lo encuentra, no reenvía y pide confirmación humana", async () => {
    const { draft } = await draftFor();
    await iso.db
      .update(outboundEmails)
      .set({ status: "sending", messageIdHeader: "<apply-perdido@apply.local>" })
      .where(eq(outboundEmails.id, Number(draft.id)));

    const res = await send(draft.id);
    expect(res.status).toBe(202);
    expect(await json(res)).toMatchObject({ status: "sending" });
    expect(google.searches).toEqual(["rfc822msgid:apply-perdido@apply.local"]);
    expect(google.sent).toEqual([]);
  });

  async function pending() {
    const { draft } = await draftFor();
    google.sendMode = "drop";
    await send(draft.id);
    google.sendMode = "ok";
    google.sent.length = 0; // Gmail no lo tiene: el dedupe no lo encontrará.
    return draft;
  }

  it("confirmar que no salió lo deja failed y permite reenviar con el mismo Message-ID", async () => {
    const draft = await pending();
    const messageId = (await row(draft.id))?.messageIdHeader;
    const resolved = await post(`/email-drafts/${draft.id}/resolve`, { sent: false });
    expect(resolved.status).toBe(200);
    expect(await json(resolved)).toMatchObject({ status: "failed", applicationId: null });

    const res = await send(draft.id);
    expect(res.status).toBe(200);
    expect(google.sent).toHaveLength(1);
    expect(google.sent[0]?.messageId).toBe(messageId);
    expect((await row(draft.id))?.status).toBe("sent");
  });

  it("confirmar que sí salió lo deja sent con la postulación, sin ids de Gmail", async () => {
    const draft = await pending();
    const res = await post(`/email-drafts/${draft.id}/resolve`, { sent: true });
    expect(res.status).toBe(200);
    const resolved = await json(res);
    expect(resolved).toMatchObject({ status: "sent", sentAt: expect.any(String) });
    expect(await row(draft.id)).toMatchObject({ gmailId: null, threadId: null });
    const timeline = await applications().timeline(resolved.applicationId ?? "");
    expect(timeline?.events).toEqual([
      expect.objectContaining({ type: "applied", channel: "email", gmailMessageId: null }),
    ]);
    expect(google.sent).toEqual([]);
  });

  it("resolver un correo que no está en sending responde 409; un cuerpo inválido 400", async () => {
    const { draft } = await draftFor();
    expect((await post(`/email-drafts/${draft.id}/resolve`, { sent: true })).status).toBe(409);
    expect((await post(`/email-drafts/${draft.id}/resolve`, { sent: "sí" })).status).toBe(400);
    expect((await post("/email-drafts/999/resolve", { sent: true })).status).toBe(404);
    expect((await row(draft.id))?.status).toBe("draft");
  });
});

describe("fallos de Gmail", () => {
  it("AC-006: invalid_grant deja reauth required y el correo no queda sent", async () => {
    const { draft } = await draftFor();
    google.refreshMode = "invalid_grant";
    const res = await send(draft.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringContaining("reauth") });
    // Gmail no se llegó a llamar: el correo vuelve a borrador para enviarlo tras reconectar.
    expect(await row(draft.id)).toMatchObject({ status: "draft", gmailId: null, sentAt: null });
    expect(await gmail.status()).toMatchObject({ state: "reauth_required" });
    expect(google.sent).toEqual([]);
    expect(await applications().list()).toEqual([]);
  });

  it("un rechazo de Gmail deja failed, responde 502 y no escribe el cuerpo ni tokens en los logs", async () => {
    const { draft } = await draftFor();
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    google.sendMode = "reject";
    const res = await send(draft.id);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: expect.stringContaining("Gmail rechazó") });
    expect((await row(draft.id))?.status).toBe("failed");
    expect(await applications().list()).toEqual([]);

    const logged = JSON.stringify(logs.mock.calls);
    expect(logs).toHaveBeenCalled();
    expect(logged).not.toContain(SECRET_BODY);
    expect(logged).not.toMatch(/fake-(refresh|access)/);
  });

  it("un correo rechazado se corrige: editarlo lo vuelve borrador y se reenvía con el mismo Message-ID", async () => {
    const { draft } = await draftFor();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    google.sendMode = "reject";
    expect((await send(draft.id)).status).toBe(502);
    const rejected = await row(draft.id);

    const fixed = await drafts().update(draft.id, {
      to: "laura@example.com",
      subject: draft.subject,
      body: draft.body,
    });
    expect(fixed).toMatchObject({ status: "draft", to: "laura@example.com" });

    google.sendMode = "ok";
    const res = await send(draft.id);
    expect(res.status).toBe(200);
    expect(google.sent.map((m) => m.messageId)).toEqual([rejected?.messageIdHeader]);
  });

  it("si no se puede generar el PDF, el borrador sigue en draft", async () => {
    const { draft } = await draftFor();
    renderPdf = async () => {
      throw new Error("Chrome no disponible");
    };
    expect((await send(draft.id)).status).toBe(500);
    expect((await row(draft.id))?.status).toBe("draft");
    expect(google.sent).toEqual([]);
  });

  it("sin cuenta conectada responde 409 y el borrador sigue en draft", async () => {
    const { draft } = await draftFor();
    await rm(tokenDir, { recursive: true, force: true });
    const res = await send(draft.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.stringContaining("no está conectado") });
    expect((await row(draft.id))?.status).toBe("draft");
  });
});
