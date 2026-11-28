import {
  DISCARD_REASONS,
  type StatusChange,
  VACANCY_STATUSES,
  type VacancyProcess,
} from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApplicationsRepository } from "../applications/repository.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createProcessRepository } from "./repository.ts";
import { processRoutes } from "./routes.ts";

// Anotados con el tipo de @apply/shared: si el contrato cambia, no compila.
const changeSchema: z.ZodType<StatusChange> = z.strictObject({
  id: z.string(),
  from: z.enum(VACANCY_STATUSES).nullable(),
  to: z.enum(VACANCY_STATUSES),
  discardReason: z.enum(DISCARD_REASONS).nullable(),
  note: z.string().nullable(),
  channel: z.string().nullable(),
  source: z.enum(["auto", "manual"]),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
const processSchema: z.ZodType<VacancyProcess> = z.strictObject({
  vacancyId: z.string(),
  status: z.enum(VACANCY_STATUSES),
  discardReason: z.enum(DISCARD_REASONS).nullable(),
  history: z.array(changeSchema),
  contacts: z.array(z.any()),
});

let iso: IsolatedDb;
let app: Hono;
let vacancies: ReturnType<typeof createVacanciesRepository>;
let applications: ReturnType<typeof createApplicationsRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  vacancies = createVacanciesRepository(iso.db);
  applications = createApplicationsRepository(iso.db);
  app = new Hono()
    .basePath("/api")
    .route("/", processRoutes({ repo: createProcessRepository(iso.db) }));
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE vacancy_status_changes, application_events, applications, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const call = (method: string, url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function process(vacancyId: string): Promise<VacancyProcess> {
  const res = await call("GET", `/vacancies/${vacancyId}/process`);
  expect(res.status).toBe(200);
  return processSchema.parse(await res.json());
}

async function move(vacancyId: string, body: Record<string, unknown>): Promise<VacancyProcess> {
  const res = await call("POST", `/vacancies/${vacancyId}/status`, body);
  expect(res.status, await res.clone().text()).toBe(201);
  return processSchema.parse(await res.json());
}

describe("proceso de la vacante (#80)", () => {
  it("una vacante nueva está Por postular y sin historial", async () => {
    const { id } = await vacancies.create(newVacancy());
    const p = await process(id);
    expect(p).toMatchObject({ vacancyId: id, status: "to_apply", discardReason: null });
    expect(p.history).toEqual([]);
    expect((await vacancies.get(id))?.status).toBe("to_apply");
  });

  it("mueve libremente, también hacia atrás, y guarda cada cambio con su nota", async () => {
    const { id } = await vacancies.create(newVacancy());
    await move(id, { to: "interview", note: "Me escribió la reclutadora", channel: "linkedin" });
    const back = await move(id, { to: "applied" });

    expect(back.status).toBe("applied");
    expect(back.history.map((h) => [h.from, h.to])).toEqual([
      ["interview", "applied"],
      ["to_apply", "interview"],
    ]);
    expect(back.history[1]).toMatchObject({
      note: "Me escribió la reclutadora",
      channel: "linkedin",
      source: "manual",
    });
    expect((await vacancies.get(id))?.status).toBe("applied");
  });

  it("descartar guarda el motivo; salir de Descartada lo limpia", async () => {
    const { id } = await vacancies.create(newVacancy());
    const discarded = await move(id, { to: "discarded", discardReason: "rejected" });
    expect(discarded).toMatchObject({ status: "discarded", discardReason: "rejected" });
    expect(discarded.history[0]?.discardReason).toBe("rejected");

    const reopened = await move(id, { to: "contacted" });
    expect(reopened).toMatchObject({ status: "contacted", discardReason: null });
    expect((await vacancies.get(id))?.discardReason).toBeNull();
  });

  it("guarda la fecha en que ocurrió el cambio si se indica", async () => {
    const { id } = await vacancies.create(newVacancy());
    const p = await move(id, { to: "applied", occurredAt: "2026-01-05T10:00:00.000Z" });
    expect(p.history[0]?.occurredAt).toBe("2026-01-05T10:00:00.000Z");
  });

  it.each([
    ["mismo estado", { to: "to_apply" }, /ya está/],
    ["descartar sin motivo", { to: "discarded" }, /motivo/],
    ["motivo sin descartar", { to: "offer", discardReason: "closed" }, /descartar/],
    ["estado desconocido", { to: "ghosted" }, /to/],
    ["canal desconocido", { to: "applied", channel: "fax" }, /Canal/],
    ["fecha futura", { to: "applied", occurredAt: "2999-01-01T00:00:00.000Z" }, /futura/],
  ])("rechaza con 400: %s", async (_name, body, message) => {
    const { id } = await vacancies.create(newVacancy());
    const res = await call("POST", `/vacancies/${id}/status`, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(message);
    expect((await process(id)).history).toEqual([]);
  });

  it("404 si la vacante no existe", async () => {
    expect((await call("GET", "/vacancies/999/process")).status).toBe(404);
    expect((await call("POST", "/vacancies/999/status", { to: "applied" })).status).toBe(404);
  });

  it("borrar la vacante borra su historial", async () => {
    const { id } = await vacancies.create(newVacancy());
    await move(id, { to: "applied" });
    await vacancies.remove(id);
    const [left] = await iso.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM vacancy_status_changes`,
    );
    expect(left?.n).toBe(0);
  });
});

describe("movimientos automáticos del registro de correo (#80)", () => {
  it("enviar la postulación por correo la pasa a Postulada", async () => {
    const { id } = await vacancies.create(newVacancy());
    await applications.create({
      vacancyId: id,
      channel: "email",
      source: "auto",
      gmailMessageId: "m-1",
      appliedAt: "2026-02-01T09:00:00.000Z",
    });
    const p = await process(id);
    expect(p.status).toBe("applied");
    expect(p.history).toEqual([
      expect.objectContaining({
        from: "to_apply",
        to: "applied",
        channel: "email",
        source: "auto",
        occurredAt: "2026-02-01T09:00:00.000Z",
      }),
    ]);
  });

  it("una respuesta en Gmail la pasa a En contacto una sola vez", async () => {
    const { id } = await vacancies.create(newVacancy());
    const created = await applications.create({ vacancyId: id, source: "auto", channel: "email" });
    const reply = { type: "contacted" as const, source: "auto" as const, gmailMessageId: "r-1" };
    await applications.addEvent(created?.id ?? "", reply);
    await applications.addEvent(created?.id ?? "", reply);
    const p = await process(id);
    expect(p.status).toBe("contacted");
    expect(p.history.map((h) => h.to)).toEqual(["contacted", "applied"]);
  });

  it("no retrocede ni reabre lo que la persona ya movió", async () => {
    const { id } = await vacancies.create(newVacancy());
    await move(id, { to: "interview" });
    const created = await applications.create({ vacancyId: id, source: "auto", channel: "email" });
    await applications.addEvent(created?.id ?? "", { type: "contacted", source: "auto" });
    expect((await process(id)).status).toBe("interview");

    await move(id, { to: "discarded", discardReason: "withdrawn" });
    await applications.addEvent(created?.id ?? "", { type: "contacted", source: "auto" });
    const p = await process(id);
    expect(p.status).toBe("discarded");
    expect(p.history).toHaveLength(2);
  });

  it("un evento manual del registro no mueve la vacante", async () => {
    const { id } = await vacancies.create(newVacancy());
    await applications.create({ vacancyId: id, source: "manual" });
    expect((await process(id)).status).toBe("to_apply");
  });
});
