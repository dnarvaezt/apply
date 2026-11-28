import type {
  AddEventResult,
  Application,
  ApplicationContact,
  ApplicationTimeline,
  Channel,
  Contact,
} from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApplicationsRepository } from "../applications/repository.ts";
import { applicationRoutes } from "../applications/routes.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createContactsRepository } from "./repository.ts";
import { contactRoutes } from "./routes.ts";

// Anotados con los tipos de @apply/shared: si el contrato cambia, no compila.
const contactShape = {
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  profileUrl: z.string().nullable(),
  notes: z.string().nullable(),
  company: z.string().nullable(),
  createdAt: z.iso.datetime(),
};
const contactSchema: z.ZodType<Contact> = z.strictObject(contactShape);
const applicationContactSchema: z.ZodType<ApplicationContact> = z.strictObject({
  ...contactShape,
  isProcessStart: z.boolean(),
});

let iso: IsolatedDb;
let app: Hono;
let vacancies: ReturnType<typeof createVacanciesRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  vacancies = createVacanciesRepository(iso.db);
  app = new Hono()
    .basePath("/api")
    .route("/", applicationRoutes({ repo: createApplicationsRepository(iso.db) }))
    .route("/", contactRoutes({ repo: createContactsRepository(iso.db) }));
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE application_events, vacancy_status_changes, vacancy_contacts, contacts, applications, match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const call = (method: string, url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const LAURA = {
  name: "Laura Gómez",
  title: "Talent Partner",
  email: "laura@example.com",
  phone: "+57 300 000 0000",
  profileUrl: "https://www.linkedin.com/in/laura-ejemplo",
  notes: "Me escribió por LinkedIn",
};

async function newApplication(body: Record<string, unknown> = {}): Promise<Application> {
  const { id: vacancyId } = await vacancies.create(newVacancy());
  const res = await call("POST", "/applications", { vacancyId, ...body });
  expect(res.status).toBe(201);
  return (await res.json()) as Application;
}

async function addContact(vacancyId: string, body: unknown): Promise<ApplicationContact> {
  const res = await call("POST", `/vacancies/${vacancyId}/contacts`, body);
  expect(res.status).toBe(201);
  return applicationContactSchema.parse(await res.json());
}

async function timeline(applicationId: string): Promise<ApplicationTimeline> {
  return (await (
    await call("GET", `/applications/${applicationId}`)
  ).json()) as ApplicationTimeline;
}

describe("contactos de la vacante (REQ-001, REQ-002, #80)", () => {
  it("AC-001: crear un contacto, vincularlo y registrar un contacted por linkedin funciona sin Gmail", async () => {
    const application = await newApplication({ appliedAt: "2026-11-01T09:00:00.000Z" });
    const contact = await addContact(application.vacancyId, LAURA);
    expect(contact).toEqual({
      id: "1",
      ...LAURA,
      company: "ACME S.A.",
      createdAt: expect.any(String),
      isProcessStart: false,
    });

    const res = await call("POST", `/applications/${application.id}/events`, {
      type: "contacted",
      channel: "linkedin",
      source: "manual",
      contactId: contact.id,
      occurredAt: "2026-11-02T15:00:00.000Z",
    });
    expect(res.status).toBe(201);
    const { event, application: updated } = (await res.json()) as AddEventResult;
    expect(event).toMatchObject({
      type: "contacted",
      channel: "linkedin",
      source: "manual",
      contactId: contact.id,
      occurredAt: "2026-11-02T15:00:00.000Z",
    });
    expect(updated.status).toBe("contacted");

    const view = await timeline(application.id);
    expect(view.contacts).toEqual([contact]);
    expect(view.events.map((e) => e.contactId)).toEqual([null, contact.id]);
  });

  it("los campos opcionales vacíos se guardan como null", async () => {
    const application = await newApplication();
    const contact = await addContact(application.vacancyId, {
      name: " Ana ",
      email: "",
      phone: "  ",
    });
    expect(contact).toMatchObject({
      name: "Ana",
      title: null,
      email: null,
      phone: null,
      profileUrl: null,
      notes: null,
    });
  });

  it("editar un contacto actualiza sus datos y conserva el vínculo", async () => {
    const application = await newApplication();
    const contact = await addContact(application.vacancyId, LAURA);

    const res = await call("PUT", `/contacts/${contact.id}`, {
      name: "Laura G.",
      title: "Recruiter",
      email: "",
    });
    expect(res.status).toBe(200);
    expect(contactSchema.parse(await res.json())).toEqual({
      id: contact.id,
      name: "Laura G.",
      title: "Recruiter",
      email: null,
      phone: null,
      profileUrl: null,
      notes: null,
      company: "ACME S.A.",
      createdAt: contact.createdAt,
    });
    expect((await timeline(application.id)).contacts.map((c) => c.name)).toEqual(["Laura G."]);
  });

  it.each([
    [{}],
    [{ name: "  " }],
    [{ name: "Ana", email: "no-es-correo" }],
    [{ name: "Ana", profileUrl: "linkedin" }],
    [{ name: "Ana", isProcessStart: "sí" }],
  ])("valida el contacto: %j responde 400", async (body) => {
    const application = await newApplication();
    const res = await call("POST", `/vacancies/${application.vacancyId}/contacts`, body);
    expect(res.status).toBe(400);
    expect((await timeline(application.id)).contacts).toEqual([]);
  });

  it("404 para una vacante o un contacto inexistente", async () => {
    expect((await call("POST", "/vacancies/99/contacts", LAURA)).status).toBe(404);
    expect((await call("POST", "/vacancies/x/contacts", LAURA)).status).toBe(404);
    expect((await call("PUT", "/contacts/99", LAURA)).status).toBe(404);
    expect((await call("PUT", "/contacts/x", LAURA)).status).toBe(404);
    expect((await call("PUT", "/contacts/1", { name: "" })).status).toBe(400);
    expect((await call("PATCH", "/vacancies/1/contacts/1", { isProcessStart: true })).status).toBe(
      404,
    );
  });

  it("un contacto de otra vacante no se acepta en un evento", async () => {
    const a = await newApplication();
    const b = await newApplication();
    const foreign = await addContact(b.vacancyId, LAURA);
    const res = await call("POST", `/applications/${a.id}/events`, {
      type: "contacted",
      source: "manual",
      contactId: foreign.id,
    });
    expect(res.status).toBe(400);
    expect((await timeline(a.id)).events).toHaveLength(1);
  });
});

describe("inicio de proceso (REQ-005)", () => {
  it("AC-004: marcar un contacto como inicio de proceso se guarda y se puede desmarcar", async () => {
    const application = await newApplication();
    const laura = await addContact(application.vacancyId, LAURA);
    const ana = await addContact(application.vacancyId, { name: "Ana", isProcessStart: true });
    expect(ana.isProcessStart).toBe(true);

    const marked = await call("PATCH", `/vacancies/${application.vacancyId}/contacts/${laura.id}`, {
      isProcessStart: true,
    });
    expect(marked.status).toBe(200);
    expect(applicationContactSchema.parse(await marked.json()).isProcessStart).toBe(true);
    // Solo uno inicia el proceso: marcar a Laura desmarca a Ana.
    expect(
      (await timeline(application.id)).contacts.map((c) => [c.name, c.isProcessStart]),
    ).toEqual([
      ["Laura Gómez", true],
      ["Ana", false],
    ]);

    const unmarked = await call(
      "PATCH",
      `/vacancies/${application.vacancyId}/contacts/${laura.id}`,
      {
        isProcessStart: false,
      },
    );
    expect(unmarked.status).toBe(200);
    expect((await timeline(application.id)).contacts.every((c) => !c.isProcessStart)).toBe(true);

    expect(
      (await call("PATCH", `/vacancies/${application.vacancyId}/contacts/${laura.id}`, {})).status,
    ).toBe(400);
  });
});

describe("eventos manuales (REQ-003, REQ-004, REQ-006)", () => {
  it("AC-002: el evento manual guarda source, canal y fecha, y el estado cambia según #17", async () => {
    const application = await newApplication({
      channel: "ats",
      appliedAt: "2026-11-01T09:00:00.000Z",
    });
    const res = await call("POST", `/applications/${application.id}/events`, {
      type: "interview",
      channel: "phone",
      source: "manual",
      occurredAt: "2026-11-03T16:30:00.000Z",
      notes: "Llamada con el equipo",
    });
    expect(res.status).toBe(201);

    const view = await timeline(application.id);
    expect(view.application.status).toBe("interview");
    expect(
      view.events.map(({ type, channel, source, occurredAt, notes }) => ({
        type,
        channel,
        source,
        occurredAt,
        notes,
      })),
    ).toEqual([
      {
        type: "applied",
        channel: "ats",
        source: "manual",
        occurredAt: "2026-11-01T09:00:00.000Z",
        notes: null,
      },
      {
        type: "interview",
        channel: "phone",
        source: "manual",
        occurredAt: "2026-11-03T16:30:00.000Z",
        notes: "Llamada con el equipo",
      },
    ]);
  });

  it("AC-003: una fecha futura o un canal inexistente responden 400", async () => {
    const application = await newApplication();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const event = (body: object) =>
      call("POST", `/applications/${application.id}/events`, {
        type: "interview",
        source: "manual",
        ...body,
      });

    expect((await event({ occurredAt: future })).status).toBe(400);
    expect((await event({ channel: "fax" })).status).toBe(400);
    expect((await timeline(application.id)).events).toHaveLength(1);

    const { id: vacancyId } = await vacancies.create(newVacancy());
    expect((await call("POST", "/applications", { vacancyId, appliedAt: future })).status).toBe(
      400,
    );
    expect((await call("POST", "/applications", { vacancyId, channel: "fax" })).status).toBe(400);
  });

  it("una fecha de hace un instante se acepta", async () => {
    const application = await newApplication();
    const res = await call("POST", `/applications/${application.id}/events`, {
      type: "interview",
      source: "manual",
      occurredAt: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
  });
});

describe("canales", () => {
  it("GET /channels lista los canales de la tabla por nombre", async () => {
    const res = await call("GET", "/channels");
    expect(res.status).toBe(200);
    const list = (await res.json()) as Channel[];
    expect(list.map((c) => c.slug).sort()).toEqual(
      ["ats", "email", "linkedin", "other", "phone", "whatsapp"].sort(),
    );
    expect(list.every((c) => c.name.length > 0)).toBe(true);
  });
});
