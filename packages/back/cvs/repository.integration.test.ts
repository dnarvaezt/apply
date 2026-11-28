import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { matchReports, outboundEmails } from "#db";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { createCvsRepository } from "./repository.ts";

let iso: IsolatedDb;
let cvs: ReturnType<typeof createCvsRepository>;
let vacancies: ReturnType<typeof createVacanciesRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  cvs = createCvsRepository(iso.db);
  vacancies = createVacanciesRepository(iso.db);
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

const input = (vacancyId: string | null, title = "CV Acme") => ({
  vacancyId,
  title,
  markdown: "# Ana\n\n**Dev**",
  language: "es",
});

describe("repositorio de CVs (AC-001)", () => {
  it("crea y lee un CV con el contrato JSON intacto", async () => {
    const vacancy = await vacancies.create(newVacancy());
    const created = await cvs.create(input(vacancy.id));

    expect(created).toEqual({
      id: "1",
      vacancyId: vacancy.id,
      title: "CV Acme",
      markdown: "# Ana\n\n**Dev**",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(created.updatedAt).toBe(created.createdAt);
    expect(await cvs.get(created.id)).toEqual(created);
  });

  it("lista sin markdown, ordenado por edición más reciente", async () => {
    const a = await cvs.create(input(null, "A"));
    const b = await cvs.create(input(null, "B"));
    const c = await cvs.create(input(null, "C"));
    await cvs.update(a.id, { markdown: "# editado" });

    const list = await cvs.list();
    expect(list.map((m) => m.id)).toEqual([a.id, c.id, b.id]);
    expect(list[0]).not.toHaveProperty("markdown");
    expect(list[0]?.vacancyId).toBeNull();
  });

  it("actualiza markdown y título, y refresca updatedAt", async () => {
    const created = await cvs.create(input(null));
    await new Promise((r) => setTimeout(r, 15));
    const updated = await cvs.update(created.id, { markdown: "# nuevo", title: "  Otro  " });

    expect(updated?.markdown).toBe("# nuevo");
    expect(updated?.title).toBe("Otro");
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(Date.parse(updated?.updatedAt ?? "")).toBeGreaterThan(Date.parse(created.updatedAt));
    expect(await cvs.get(created.id)).toEqual(updated);
  });

  it("conserva el título cuando llega vacío o ausente", async () => {
    const created = await cvs.create(input(null, "Original"));
    expect((await cvs.update(created.id, { markdown: "a", title: "   " }))?.title).toBe("Original");
    expect((await cvs.update(created.id, { markdown: "b" }))?.title).toBe("Original");
  });

  it("update de un CV inexistente o con id inválido devuelve null", async () => {
    expect(await cvs.update("999", { markdown: "x" })).toBeNull();
    expect(await cvs.update("nope", { markdown: "x" })).toBeNull();
    expect(await cvs.get("nope")).toBeNull();
  });

  it("borra el CV y borrar de nuevo no falla", async () => {
    const created = await cvs.create(input(null));
    await cvs.remove(created.id);
    expect(await cvs.get(created.id)).toBeNull();
    await cvs.remove(created.id);
    await cvs.remove("nope");
  });

  it("no guarda el PDF: la tabla no tiene columna binaria (C1)", async () => {
    const cols = await iso.db.execute(
      sql`SELECT data_type FROM information_schema.columns WHERE table_name = 'cvs'`,
    );
    expect(cols.map((c) => c.data_type)).not.toContain("bytea");
  });
});

describe("borrar un CV no deja filas huérfanas (REQ-006)", () => {
  it("elimina sus informes de match", async () => {
    const vacancy = await vacancies.create(newVacancy());
    const cv = await cvs.create(input(vacancy.id));
    await iso.db.insert(matchReports).values({
      cvId: Number(cv.id),
      vacancyId: Number(vacancy.id),
      score: 0.5,
      model: "m",
      embedModel: "e",
      weights: {},
      cvHash: "h",
      report: {},
    });

    await cvs.remove(cv.id);

    expect(await iso.db.select().from(matchReports)).toHaveLength(0);
  });

  it("elimina sus borradores de correo (#19)", async () => {
    const vacancy = await vacancies.create(newVacancy());
    const cv = await cvs.create(input(vacancy.id));
    await iso.db
      .insert(outboundEmails)
      .values({ cvId: Number(cv.id), subject: "S", body: "B", language: "es" });

    await cvs.remove(cv.id);

    expect(await iso.db.select().from(outboundEmails)).toHaveLength(0);
    expect(await cvs.get(cv.id)).toBeNull();
  });
});
