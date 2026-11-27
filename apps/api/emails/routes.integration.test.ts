import { outboundEmails } from "@apply/db";
import { EMAIL_STATUSES, type EmailDraft } from "@apply/shared";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createCvsRepository } from "../cvs/repository.ts";
import { draftApplicationEmail } from "../llm.ts";
import { fixtureAnthropic } from "../test/anthropic-fixture.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createEmailDraftsRepository } from "./repository.ts";
import { emailDraftRoutes } from "./routes.ts";

// Anotado con el tipo de @apply/shared: si el contrato cambia, no compila.
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

const EN_EMAIL = {
  subject: "Backend Engineer application",
  body: "I am applying.",
  language: "en",
};

let iso: IsolatedDb;
let app: Hono;
let cvs: ReturnType<typeof createCvsRepository>;
let vacancies: ReturnType<typeof createVacanciesRepository>;
/** Respuesta de Anthropic de la prueba en curso (frontera externa, D9). */
let llm: ReturnType<typeof fixtureAnthropic>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  cvs = createCvsRepository(iso.db);
  vacancies = createVacanciesRepository(iso.db);
  app = new Hono().basePath("/api").route(
    "/",
    emailDraftRoutes({
      repo: createEmailDraftsRepository(iso.db),
      getCv: (id) => cvs.get(id),
      getVacancy: (id) => vacancies.get(id),
      draft: (input) => draftApplicationEmail(input, llm.api),
    }),
  );
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  llm = fixtureAnthropic(EN_EMAIL);
  await iso.db.execute(
    sql`TRUNCATE outbound_emails, match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const call = (method: string, url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const rows = () => iso.db.select().from(outboundEmails);

async function englishCv(rawText = "Backend role. Apply at jobs@acme.com") {
  const vacancy = await vacancies.create(
    newVacancy({ language: "en", posterName: "Jane Doe", rawText }),
  );
  return cvs.create({
    vacancyId: vacancy.id,
    title: "CV",
    markdown: "# Ana Pérez\n\nTypeScript engineer.",
    language: "en",
  });
}

async function generate(cvId: string, body: unknown = {}): Promise<EmailDraft> {
  const res = await call("POST", `/cvs/${cvId}/email-draft`, body);
  expect(res.status).toBe(201);
  return draftSchema.parse(await res.json());
}

describe("generar el borrador del correo", () => {
  it("AC-001: vacante en inglés da un borrador en inglés que saluda al poster", async () => {
    const cv = await englishCv();
    const draft = await generate(cv.id);
    expect(draft).toMatchObject({
      cvId: cv.id,
      subject: "Backend Engineer application",
      body: "Hi Jane,\n\nI am applying.",
      language: "en",
      status: "draft",
      to: "jobs@acme.com",
    });
    expect(JSON.stringify(llm.requests[0])).toContain("TypeScript engineer.");
  });

  it("sin email en la vacante el destinatario queda vacío (C7)", async () => {
    const cv = await englishCv("Backend role. Apply through the portal.");
    expect((await generate(cv.id)).to).toBeNull();
  });

  it("AC-004: destinatario 'no-es-email' responde 400 sin llamar al LLM ni guardar", async () => {
    const cv = await englishCv();
    const res = await call("POST", `/cvs/${cv.id}/email-draft`, { to: "no-es-email" });
    expect(res.status).toBe(400);
    expect(llm.requests).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it("AC-004: destinatario vacío se acepta y queda marcado como faltante", async () => {
    const cv = await englishCv();
    const draft = await generate(cv.id, { to: "" });
    expect(draft.to).toBeNull();
    const [row] = await rows();
    expect(row?.toAddress).toBeNull();
  });

  it("AC-005: un error del LLM no crea filas en outbound_emails", async () => {
    llm = fixtureAnthropic({ ...EN_EMAIL, language: "es" });
    const cv = await englishCv();
    const res = await call("POST", `/cvs/${cv.id}/email-draft`, {});
    expect(res.status).toBe(500);
    expect(await rows()).toHaveLength(0);
  });

  it("regenerar reemplaza el borrador anterior del CV", async () => {
    const cv = await englishCv();
    await generate(cv.id);
    llm = fixtureAnthropic({ ...EN_EMAIL, subject: "Second try" });
    const second = await generate(cv.id);
    expect((await rows()).map((r) => r.subject)).toEqual(["Second try"]);
    const res = await call("GET", `/cvs/${cv.id}/email-draft`);
    expect(draftSchema.parse(await res.json()).id).toBe(second.id);
  });

  it("CV inexistente, CV sin vacante o cuerpo que no es JSON válido", async () => {
    expect((await call("POST", "/cvs/999/email-draft", {})).status).toBe(404);
    const orphan = await cvs.create({
      vacancyId: null,
      title: "x",
      markdown: "# x",
      language: "es",
    });
    expect((await call("POST", `/cvs/${orphan.id}/email-draft`, {})).status).toBe(404);
    const cv = await englishCv();
    expect((await call("POST", `/cvs/${cv.id}/email-draft`, { to: 42 })).status).toBe(400);
    expect(llm.requests).toHaveLength(0);
  });

  it("sin cuerpo en la petición usa el destinatario de la vacante", async () => {
    const cv = await englishCv();
    const res = await app.request(`/api/cvs/${cv.id}/email-draft`, { method: "POST" });
    expect(res.status).toBe(201);
    expect(draftSchema.parse(await res.json()).to).toBe("jobs@acme.com");
  });
});

describe("leer y editar el borrador", () => {
  it("AC-003: guardar y editar deja status = draft con los cambios", async () => {
    const cv = await englishCv();
    const draft = await generate(cv.id);
    const res = await call("PUT", `/email-drafts/${draft.id}`, {
      to: "jane@acme.com",
      subject: "Edited subject",
      body: "Hi Jane,\n\nEdited.",
    });
    expect(res.status).toBe(200);
    const saved = draftSchema.parse(await res.json());
    expect(saved).toMatchObject({
      id: draft.id,
      to: "jane@acme.com",
      subject: "Edited subject",
      body: "Hi Jane,\n\nEdited.",
      status: "draft",
    });
    const [row] = await rows();
    expect(row).toMatchObject({
      status: "draft",
      subject: "Edited subject",
      toAddress: "jane@acme.com",
    });

    const read = draftSchema.parse(await (await call("GET", `/cvs/${cv.id}/email-draft`)).json());
    expect(read).toEqual(saved);
  });

  it("editar con destinatario vacío lo deja faltante; con email inválido responde 400", async () => {
    const cv = await englishCv();
    const draft = await generate(cv.id);
    const fields = { subject: "S", body: "B" };
    expect(
      (await call("PUT", `/email-drafts/${draft.id}`, { ...fields, to: "no-es-email" })).status,
    ).toBe(400);
    expect((await call("PUT", `/email-drafts/${draft.id}`, { ...fields, to: "x" })).status).toBe(
      400,
    );
    expect(
      (await call("PUT", `/email-drafts/${draft.id}`, { to: "", subject: " ", body: "B" })).status,
    ).toBe(400);
    const res = await call("PUT", `/email-drafts/${draft.id}`, { ...fields, to: "" });
    expect(draftSchema.parse(await res.json()).to).toBeNull();
  });

  it("un correo que ya no es borrador no se edita (409); uno inexistente da 404", async () => {
    const cv = await englishCv();
    const draft = await generate(cv.id);
    await iso.db
      .update(outboundEmails)
      .set({ status: "sending" })
      .where(eq(outboundEmails.id, Number(draft.id)));
    const fields = { to: "", subject: "S", body: "B" };
    expect((await call("PUT", `/email-drafts/${draft.id}`, fields)).status).toBe(409);
    expect((await call("PUT", "/email-drafts/999", fields)).status).toBe(404);
    expect((await call("PUT", "/email-drafts/abc", fields)).status).toBe(404);
  });

  it("GET de un CV sin borrador responde null; de un CV inexistente, 404", async () => {
    const cv = await englishCv();
    const res = await call("GET", `/cvs/${cv.id}/email-draft`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    expect((await call("GET", "/cvs/999/email-draft")).status).toBe(404);
    expect((await call("GET", "/cvs/abc/email-draft")).status).toBe(404);
  });
});
