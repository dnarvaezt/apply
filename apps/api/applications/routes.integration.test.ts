import type { AddEventResult, Application, ApplicationTimeline } from "@apply/shared";
import { APPLICATION_STATUSES } from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createApplicationsRepository } from "./repository.ts";
import { applicationRoutes } from "./routes.ts";

// Anotado con el tipo de @apply/shared: si el contrato cambia, no compila.
const applicationSchema: z.ZodType<Application> = z.strictObject({
  id: z.string(),
  vacancyId: z.string(),
  cvId: z.string().nullable(),
  status: z.enum(APPLICATION_STATUSES),
  active: z.boolean(),
  classifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

let iso: IsolatedDb;
let app: Hono;
let vacancies: ReturnType<typeof createVacanciesRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  vacancies = createVacanciesRepository(iso.db);
  app = new Hono()
    .basePath("/api")
    .route("/", applicationRoutes({ repo: createApplicationsRepository(iso.db) }));
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE application_events, applications, match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const call = (method: string, url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function createApplication(vacancyId: string): Promise<Application> {
  const res = await call("POST", "/applications", { vacancyId, channel: "email" });
  expect(res.status).toBe(201);
  return applicationSchema.parse(await res.json());
}

describe("API de postulaciones", () => {
  it("AC-007: dos postulaciones a la misma vacante se crean y se listan con estado y activa", async () => {
    const { id: vid } = await vacancies.create(newVacancy());
    const a = await createApplication(vid);
    const b = await createApplication(vid);
    await call("POST", `/applications/${b.id}/events`, { type: "rejected", source: "manual" });

    const res = await call("GET", `/applications?vacancyId=${vid}`);
    expect(res.status).toBe(200);
    const list = z.array(applicationSchema).parse(await res.json());
    expect(list.map(({ id, status, active }) => ({ id, status, active }))).toEqual([
      { id: b.id, status: "rejected", active: false },
      { id: a.id, status: "applied", active: true },
    ]);
    expect(
      z.array(applicationSchema).parse(await (await call("GET", "/applications")).json()),
    ).toHaveLength(2);
  });

  it("AC-004: reopened con source = auto responde 400 y no guarda el evento", async () => {
    const { id: vid } = await vacancies.create(newVacancy());
    const created = await createApplication(vid);
    await call("POST", `/applications/${created.id}/events`, {
      type: "rejected",
      source: "manual",
    });

    const res = await call("POST", `/applications/${created.id}/events`, {
      type: "reopened",
      source: "auto",
    });
    expect(res.status).toBe(400);
    const timeline = (await (
      await call("GET", `/applications/${created.id}`)
    ).json()) as ApplicationTimeline;
    expect(timeline.events.map((e) => e.type)).toEqual(["applied", "rejected"]);
    expect(timeline.application.status).toBe("rejected");
  });

  it("reopened manual reabre la postulación", async () => {
    const { id: vid } = await vacancies.create(newVacancy());
    const created = await createApplication(vid);
    await call("POST", `/applications/${created.id}/events`, {
      type: "withdrawn",
      source: "manual",
    });
    const res = await call("POST", `/applications/${created.id}/events`, {
      type: "reopened",
      source: "manual",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as AddEventResult;
    expect(body.application).toMatchObject({ status: "applied", active: true });
  });

  it("un gmail_message_id repetido responde 200 con duplicate = true", async () => {
    const { id: vid } = await vacancies.create(newVacancy());
    const created = await createApplication(vid);
    const event = { type: "interview", source: "auto", gmailMessageId: "<m1@mail.gmail.com>" };
    const first = await call("POST", `/applications/${created.id}/events`, event);
    const second = await call("POST", `/applications/${created.id}/events`, event);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(((await second.json()) as AddEventResult).duplicate).toBe(true);
  });

  it.each([
    [{ type: "nope", source: "manual" }],
    [{ type: "interview" }],
    [{ type: "interview", source: "robot" }],
    [{ type: "interview", source: "manual", occurredAt: "ayer" }],
    [{ type: "interview", source: "manual", channel: "fax" }],
  ])("valida el cuerpo del evento: %j responde 400", async (body) => {
    const { id: vid } = await vacancies.create(newVacancy());
    const created = await createApplication(vid);
    const res = await call("POST", `/applications/${created.id}/events`, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("valida la creación: sin vacancyId 400, vacante inexistente 404, CV inexistente 400", async () => {
    expect((await call("POST", "/applications", {})).status).toBe(400);
    expect((await call("POST", "/applications", { vacancyId: "99" })).status).toBe(404);
    const { id: vid } = await vacancies.create(newVacancy());
    expect((await call("POST", "/applications", { vacancyId: vid, cvId: "5" })).status).toBe(400);
    expect((await call("POST", "/applications", { vacancyId: vid, source: "auto" })).status).toBe(
      201,
    );
  });

  it("404 para una postulación inexistente", async () => {
    expect((await call("GET", "/applications/9")).status).toBe(404);
    expect(
      (await call("POST", "/applications/9/events", { type: "interview", source: "manual" }))
        .status,
    ).toBe(404);
  });
});
