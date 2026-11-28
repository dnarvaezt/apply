import type { Application, TrackingMetrics } from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLASSIFIED } from "../applications/classified.ts";
import { createApplicationsRepository } from "../applications/repository.ts";
import { applicationRoutes } from "../applications/routes.ts";
import { createContactsRepository } from "../contacts/repository.ts";
import { contactRoutes } from "../contacts/routes.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createMetricsRepository, type MetricsRepository } from "./repository.ts";
import { metricRoutes } from "./routes.ts";

let iso: IsolatedDb;
let app: Hono;
let vacancies: ReturnType<typeof createVacanciesRepository>;
let metrics: MetricsRepository;

beforeAll(async () => {
  iso = await createIsolatedDb();
  vacancies = createVacanciesRepository(iso.db);
  metrics = createMetricsRepository(iso.db);
  app = new Hono()
    .basePath("/api")
    .route("/", applicationRoutes({ repo: createApplicationsRepository(iso.db) }))
    .route("/", contactRoutes({ repo: createContactsRepository(iso.db) }))
    .route("/", metricRoutes({ repo: metrics }));
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

async function apply(company: string): Promise<Application> {
  const { id: vacancyId } = await vacancies.create(newVacancy({ company }));
  const res = await call("POST", "/applications", {
    vacancyId,
    appliedAt: "2026-11-01T09:00:00.000Z",
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Application;
}

async function event(
  application: Application,
  type: string,
  day: number,
  extra: Record<string, unknown> = {},
) {
  const res = await call("POST", `/applications/${application.id}/events`, {
    type,
    source: "manual",
    occurredAt: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    ...extra,
  });
  expect(res.status).toBe(201);
}

async function markProcessStart(application: Application) {
  const res = await call("POST", `/vacancies/${application.vacancyId}/contacts`, {
    name: "Laura",
    isProcessStart: true,
  });
  expect(res.status).toBe(201);
}

async function tracking(): Promise<TrackingMetrics> {
  const res = await call("GET", "/metrics");
  expect(res.status).toBe(200);
  return (await res.json()) as TrackingMetrics;
}

/**
 * A (ACME): contactada por linkedin, luego entrevista por teléfono.
 * B (ACME): contactada por correo, luego rechazada.
 * C (Globex): sin eventos de contacto, con un contacto que inició el proceso.
 * D (Initech): acuse automático (`contacted`, auto) por correo, sin marca.
 */
async function seed() {
  const a = await apply("ACME S.A.");
  await event(a, "contacted", 2, { channel: "linkedin" });
  await event(a, "interview", 3, { channel: "phone" });
  const b = await apply("ACME S.A.");
  await event(b, "contacted", 2, { channel: "email" });
  await event(b, "rejected", 4);
  const c = await apply("Globex");
  await markProcessStart(c);
  const d = await apply("Initech");
  await event(d, "contacted", 2, { channel: "email", source: "auto" });
}

describe("GET /metrics (REQ-001..REQ-007)", () => {
  it("sin postulaciones todo es cero", async () => {
    expect(await tracking()).toEqual({
      applications: 0,
      companiesContacted: 0,
      activeProcesses: 0,
      classified: 0,
      contactOrigin: [],
      open: 0,
      closed: 0,
    });
  });

  it("AC-001: las seis métricas coinciden con el fixture de conteo conocido", async () => {
    await seed();
    expect(await tracking()).toEqual({
      applications: 4,
      companiesContacted: 2,
      activeProcesses: 2,
      classified: 2,
      contactOrigin: [
        { channel: "email", count: 2 },
        { channel: "linkedin", count: 1 },
      ],
      open: 3,
      closed: 1,
    });
  });

  it("AC-002: el contacto que inició el proceso clasifica; el acuse automático sin marca, no", async () => {
    const marked = await apply("Globex");
    await markProcessStart(marked);
    expect((await tracking()).classified).toBe(1);

    const acknowledged = await apply("Initech");
    await event(acknowledged, "contacted", 2, { source: "auto" });
    expect((await tracking()).classified).toBe(1);
  });

  it("AC-003: cambiar la definición de clasificada cambia solo ese conteo", async () => {
    await seed();
    const base = await metrics.tracking();
    const withoutContact = await metrics.tracking({ ...CLASSIFIED, processStartContact: false });
    expect(withoutContact).toEqual({ ...base, classified: 1 });
    const offerOnly = await metrics.tracking({ ...CLASSIFIED, eventTypes: ["offer"] });
    expect(offerOnly).toEqual({ ...base, classified: 1 });
    const none = await metrics.tracking({ eventTypes: [], processStartContact: false });
    expect(none).toEqual({ ...base, classified: 0 });
  });

  it("AC-004: dos postulaciones de la misma empresa con contacto cuentan una empresa", async () => {
    await event(await apply("ACME S.A."), "contacted", 2);
    await event(await apply("ACME S.A."), "offer", 3);
    expect((await tracking()).companiesContacted).toBe(1);
  });

  it("AC-005: el origen toma el canal del primer evento de contacto, no del último", async () => {
    const application = await apply("ACME S.A.");
    await event(application, "interview", 5, { channel: "phone" });
    await event(application, "contacted", 3, { channel: "linkedin" });
    expect((await tracking()).contactOrigin).toEqual([{ channel: "linkedin", count: 1 }]);
  });

  it("un primer contacto sin canal se agrupa como null, después de los canales", async () => {
    await event(await apply("ACME S.A."), "contacted", 2);
    await event(await apply("Globex"), "contacted", 2, { channel: "email" });
    expect((await tracking()).contactOrigin).toEqual([
      { channel: "email", count: 1 },
      { channel: null, count: 1 },
    ]);
  });

  it("una oferta aceptada es terminal: cerrada y fuera de procesos activos, pero clasificada", async () => {
    const application = await apply("ACME S.A.");
    await event(application, "offer", 2);
    await event(application, "offer_accepted", 3);
    expect(await tracking()).toMatchObject({
      activeProcesses: 0,
      classified: 1,
      open: 0,
      closed: 1,
    });
  });
});
