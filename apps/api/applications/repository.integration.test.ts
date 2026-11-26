import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCvsRepository } from "../cvs/repository.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createApplicationsRepository, InvalidEventError } from "./repository.ts";

let iso: IsolatedDb;
let apps: ReturnType<typeof createApplicationsRepository>;
let vacancies: ReturnType<typeof createVacanciesRepository>;
let cvs: ReturnType<typeof createCvsRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  apps = createApplicationsRepository(iso.db);
  vacancies = createVacanciesRepository(iso.db);
  cvs = createCvsRepository(iso.db);
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  // application_events es append-only (trigger): TRUNCATE no dispara triggers de fila.
  await iso.db.execute(
    sql`TRUNCATE application_events, applications, match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const T1 = "2026-11-01T10:00:00.000Z";
const T2 = "2026-11-05T10:00:00.000Z";
const T3 = "2026-11-09T10:00:00.000Z";

async function vacancyId(): Promise<string> {
  return (await vacancies.create(newVacancy())).id;
}

describe("crear postulación (REQ-001, REQ-002)", () => {
  it("registra la postulación en applied con su evento applied (fecha, canal y source)", async () => {
    const vid = await vacancyId();
    const cv = await cvs.create({ vacancyId: vid, title: "CV", markdown: "# A", language: "es" });
    const created = await apps.create({
      vacancyId: vid,
      cvId: cv.id,
      appliedAt: T1,
      channel: "email",
      source: "manual",
      notes: "por correo",
    });
    if (!created) throw new Error("sin postulación");

    expect(created).toEqual({
      id: "1",
      vacancyId: vid,
      cvId: cv.id,
      status: "applied",
      active: true,
      classifiedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const timeline = await apps.timeline(created.id);
    expect(timeline?.events).toEqual([
      {
        id: "1",
        applicationId: created.id,
        type: "applied",
        occurredAt: T1,
        channel: "email",
        source: "manual",
        notes: "por correo",
        gmailMessageId: null,
        createdAt: expect.any(String),
      },
    ]);
  });

  it("devuelve null si la vacante no existe y no deja nada guardado", async () => {
    expect(await apps.create({ vacancyId: "99", source: "manual" })).toBeNull();
    expect(await apps.list()).toEqual([]);
  });

  it("rechaza un canal desconocido sin guardar la postulación", async () => {
    const vid = await vacancyId();
    await expect(apps.create({ vacancyId: vid, channel: "fax", source: "manual" })).rejects.toThrow(
      InvalidEventError,
    );
    expect(await apps.list()).toEqual([]);
  });

  it("rechaza un CV que no existe", async () => {
    const vid = await vacancyId();
    await expect(apps.create({ vacancyId: vid, cvId: "42", source: "manual" })).rejects.toThrow(
      InvalidEventError,
    );
  });

  it("una vacante admite varias postulaciones y se filtran por vacante", async () => {
    const vid = await vacancyId();
    const other = await vacancyId();
    const a = await apps.create({ vacancyId: vid, source: "manual" });
    const b = await apps.create({ vacancyId: vid, source: "manual" });
    await apps.create({ vacancyId: other, source: "manual" });

    expect((await apps.list({ vacancyId: vid })).map((x) => x.id).sort()).toEqual(
      [a?.id, b?.id].sort(),
    );
    expect(await apps.list()).toHaveLength(3);
  });
});

describe("agregar eventos (REQ-003, REQ-004)", () => {
  it("avanza el estado y un evento menor no lo retrocede, pero queda en la línea de tiempo", async () => {
    const app = await apps.create({
      vacancyId: await vacancyId(),
      appliedAt: T1,
      source: "manual",
    });
    if (!app) throw new Error("sin postulación");

    const r1 = await apps.addEvent(app.id, { type: "interview", occurredAt: T2, source: "manual" });
    expect(r1?.application.status).toBe("interview");
    const r2 = await apps.addEvent(app.id, { type: "contacted", occurredAt: T3, source: "auto" });
    expect(r2?.application.status).toBe("interview");
    expect(r2?.duplicate).toBe(false);

    const timeline = await apps.timeline(app.id);
    expect(timeline?.events.map((e) => e.type)).toEqual(["applied", "interview", "contacted"]);
    expect(timeline?.application.status).toBe("interview");
  });

  it("un terminal es pegajoso y reopened manual lo reabre", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");

    const closed = await apps.addEvent(app.id, { type: "rejected", source: "manual" });
    expect(closed?.application).toMatchObject({ status: "rejected", active: false });
    const ignored = await apps.addEvent(app.id, { type: "offer", source: "auto" });
    expect(ignored?.application.status).toBe("rejected");
    const reopened = await apps.addEvent(app.id, { type: "reopened", source: "manual" });
    expect(reopened?.application).toMatchObject({ status: "applied", active: true });
  });

  it("rechaza reopened automático sin guardar el evento (REQ-005)", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");
    await apps.addEvent(app.id, { type: "rejected", source: "manual" });

    await expect(apps.addEvent(app.id, { type: "reopened", source: "auto" })).rejects.toThrow(
      InvalidEventError,
    );
    const timeline = await apps.timeline(app.id);
    expect(timeline?.events.map((e) => e.type)).toEqual(["applied", "rejected"]);
  });

  it("devuelve null para una postulación inexistente", async () => {
    expect(await apps.addEvent("77", { type: "interview", source: "manual" })).toBeNull();
    expect(await apps.addEvent("abc", { type: "interview", source: "manual" })).toBeNull();
    expect(await apps.timeline("77")).toBeNull();
    expect(await apps.get("abc")).toBeNull();
  });

  it("AC-003: si falla la actualización del estado, el evento no queda guardado", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");

    // Fallo real de Postgres al actualizar `applications`, no un mock del repositorio.
    await iso.db.execute(sql`
      CREATE FUNCTION fail_status_update() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'fallo simulado al actualizar el estado'; END;
      $$ LANGUAGE plpgsql`);
    await iso.db.execute(sql`
      CREATE TRIGGER fail_status_update BEFORE UPDATE ON applications
      FOR EACH ROW EXECUTE FUNCTION fail_status_update()`);
    try {
      await expect(
        apps.addEvent(app.id, { type: "interview", source: "manual" }),
      ).rejects.toThrow();
    } finally {
      await iso.db.execute(sql`DROP TRIGGER fail_status_update ON applications`);
      await iso.db.execute(sql`DROP FUNCTION fail_status_update()`);
    }

    const timeline = await apps.timeline(app.id);
    expect(timeline?.events.map((e) => e.type)).toEqual(["applied"]);
    expect(timeline?.application.status).toBe("applied");
  });
});

describe("classified_at (REQ-006, AC-005)", () => {
  it("queda con la fecha del primer interview y no cambia con un offer posterior", async () => {
    const app = await apps.create({
      vacancyId: await vacancyId(),
      appliedAt: T1,
      source: "manual",
    });
    if (!app) throw new Error("sin postulación");

    await apps.addEvent(app.id, { type: "contacted", occurredAt: T1, source: "manual" });
    expect((await apps.get(app.id))?.classifiedAt).toBeNull();
    await apps.addEvent(app.id, { type: "interview", occurredAt: T2, source: "manual" });
    expect((await apps.get(app.id))?.classifiedAt).toBe(T2);
    const offer = await apps.addEvent(app.id, { type: "offer", occurredAt: T3, source: "manual" });
    expect(offer?.application).toMatchObject({ status: "offer", classifiedAt: T2 });
  });

  it("un offer directo también clasifica", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");
    const r = await apps.addEvent(app.id, { type: "offer", occurredAt: T3, source: "manual" });
    expect(r?.application.classifiedAt).toBe(T3);
  });

  it("un interview sobre una postulación cerrada no la clasifica", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");
    await apps.addEvent(app.id, { type: "rejected", source: "manual" });
    const r = await apps.addEvent(app.id, { type: "interview", occurredAt: T2, source: "auto" });
    expect(r?.application).toMatchObject({ status: "rejected", classifiedAt: null });
  });
});

describe("idempotencia por gmail_message_id (REQ-008, AC-006)", () => {
  it("dos eventos con el mismo gmail_message_id dejan uno", async () => {
    const app = await apps.create({ vacancyId: await vacancyId(), source: "manual" });
    if (!app) throw new Error("sin postulación");
    const event = {
      type: "interview" as const,
      occurredAt: T2,
      source: "auto" as const,
      gmailMessageId: "<abc@mail.gmail.com>",
    };

    const first = await apps.addEvent(app.id, event);
    const second = await apps.addEvent(app.id, { ...event, occurredAt: T3 });

    expect(first?.duplicate).toBe(false);
    expect(second?.duplicate).toBe(true);
    expect(second?.event).toEqual(first?.event);
    const timeline = await apps.timeline(app.id);
    expect(timeline?.events.filter((e) => e.gmailMessageId === event.gmailMessageId)).toHaveLength(
      1,
    );
  });
});
