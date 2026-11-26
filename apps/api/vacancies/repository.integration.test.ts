import { companies, vacancies } from "@apply/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCvsRepository } from "../cvs/repository.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "./repository.ts";

let iso: IsolatedDb;
let repo: ReturnType<typeof createVacanciesRepository>;

beforeAll(async () => {
  iso = await createIsolatedDb();
  repo = createVacanciesRepository(iso.db);
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

describe("repositorio de vacantes (AC-001)", () => {
  it("crea y lee una vacante con el contrato JSON intacto", async () => {
    const input = newVacancy({
      sourceUrl: "https://example.com/job/1",
      location: null,
      seniority: null,
    });
    const created = await repo.create(input);

    expect(created.id).toBe("1");
    expect(typeof created.id).toBe("string");
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    const { id: _id, createdAt: _createdAt, ...rest } = created;
    expect(rest).toEqual(input);
    expect(await repo.get(created.id)).toEqual(created);
  });

  it("guarda una vacante pegada como texto con sourceUrl null", async () => {
    const created = await repo.create(newVacancy({ sourceUrl: null }));
    expect(created.sourceUrl).toBeNull();
    const [row] = await iso.db.select().from(vacancies);
    expect(row?.source).toBe("text");
  });

  it("marca la fuente 'url' cuando hay sourceUrl", async () => {
    await repo.create(newVacancy({ sourceUrl: "https://example.com/x" }));
    const [row] = await iso.db.select().from(vacancies);
    expect(row?.source).toBe("url");
  });

  it("lista de la más nueva a la más antigua", async () => {
    const a = await repo.create(newVacancy({ title: "A" }));
    const b = await repo.create(newVacancy({ title: "B" }));
    const c = await repo.create(newVacancy({ title: "C" }));
    expect((await repo.list()).map((v) => v.id)).toEqual([c.id, b.id, a.id]);
  });

  it("devuelve lista vacía y null cuando no hay datos", async () => {
    expect(await repo.list()).toEqual([]);
    expect(await repo.get("1")).toBeNull();
    expect(await repo.get("no-es-un-id")).toBeNull();
  });

  it("borra la vacante y borrar de nuevo no falla", async () => {
    const created = await repo.create(newVacancy());
    await repo.remove(created.id);
    expect(await repo.get(created.id)).toBeNull();
    await repo.remove(created.id);
    await repo.remove("no-es-un-id");
  });
});

describe("poster, fecha y plataforma (REQ-001..007)", () => {
  it("guarda y lee poster, fecha con precisión y plataforma", async () => {
    const input = newVacancy({
      platform: "linkedin",
      posterName: "Laura Gómez",
      posterTitle: "Technical Recruiter",
      posterProfileUrl: "https://www.linkedin.com/in/laura",
      postedAt: "2026-03-12T12:00:00.000Z",
      postedAtPrecision: "relative",
    });
    const created = await repo.create(input);
    const { id: _id, createdAt: _createdAt, ...rest } = created;
    expect(rest).toEqual(input);
    const [platform] = await iso.db.execute(
      sql`SELECT p.slug FROM vacancies v JOIN platforms p ON p.id = v.platform_id`,
    );
    expect(platform?.slug).toBe("linkedin");
  });

  it("usa la fecha de creación indicada", async () => {
    const createdAt = new Date("2026-03-15T12:00:00.000Z");
    const created = await repo.create(newVacancy(), createdAt);
    expect(created.createdAt).toBe(createdAt.toISOString());
  });

  it("falla si la plataforma no existe en la tabla platforms", async () => {
    await expect(repo.create(newVacancy({ platform: "inexistente" }))).rejects.toThrow(
      "Falta la plataforma 'inexistente'",
    );
  });

  it("update cambia solo los campos enviados; la fecha manual es exacta", async () => {
    const created = await repo.create(
      newVacancy({
        posterName: "Extraída",
        posterTitle: "Recruiter",
        postedAt: "2026-03-12T12:00:00.000Z",
        postedAtPrecision: "relative",
      }),
    );
    const updated = await repo.update(created.id, {
      posterName: "Corregida",
      postedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    expect(updated).toMatchObject({
      posterName: "Corregida",
      posterTitle: "Recruiter",
      postedAt: "2026-03-01T00:00:00.000Z",
      postedAtPrecision: "exact",
    });
    expect(await repo.get(created.id)).toEqual(updated);
  });

  it("update con postedAt null limpia la fecha a unknown", async () => {
    const created = await repo.create(
      newVacancy({ postedAt: "2026-03-01T00:00:00.000Z", postedAtPrecision: "exact" }),
    );
    expect(await repo.update(created.id, { postedAt: null })).toMatchObject({
      postedAt: null,
      postedAtPrecision: "unknown",
    });
  });

  it("update sin campos devuelve la vacante intacta; id inexistente devuelve null", async () => {
    const created = await repo.create(newVacancy());
    expect(await repo.update(created.id, {})).toEqual(created);
    expect(await repo.update("999", { posterName: "x" })).toBeNull();
    expect(await repo.update("no-es-un-id", { posterName: "x" })).toBeNull();
  });
});

describe("empresas normalizadas (AC-002 / REQ-003)", () => {
  it("dos vacantes de 'ACME S.A.' y 'acme sa' comparten una fila en companies", async () => {
    const first = await repo.create(newVacancy({ company: "ACME S.A." }));
    const second = await repo.create(newVacancy({ company: "acme sa" }));

    const rows = await iso.db.select().from(companies);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.normalizedName).toBe("acme sa");
    const linked = await iso.db.select({ companyId: vacancies.companyId }).from(vacancies);
    expect(new Set(linked.map((r) => r.companyId)).size).toBe(1);
    expect(first.company).toBe("ACME S.A.");
    expect(second.company).toBe("ACME S.A.");
  });

  it("empresas distintas crean filas distintas", async () => {
    await repo.create(newVacancy({ company: "Acme" }));
    await repo.create(newVacancy({ company: "Globex" }));
    expect(await iso.db.select().from(companies)).toHaveLength(2);
  });

  it("creaciones concurrentes de la misma empresa no la duplican", async () => {
    await Promise.all(
      ["Acme", "ACME", "acme.", "Ácme"].map((company) => repo.create(newVacancy({ company }))),
    );
    expect(await iso.db.select().from(companies)).toHaveLength(1);
  });
});

describe("borrar una vacante no deja filas huérfanas (REQ-006)", () => {
  it("los CVs de la vacante sobreviven con vacancyId null", async () => {
    const cvs = createCvsRepository(iso.db);
    const vacancy = await repo.create(newVacancy());
    const cv = await cvs.create({
      vacancyId: vacancy.id,
      title: "CV",
      markdown: "# Yo",
      language: "es",
    });

    await repo.remove(vacancy.id);

    expect((await cvs.get(cv.id))?.vacancyId).toBeNull();
    const dangling = await iso.db.execute(
      sql`SELECT count(*)::int AS n FROM cvs c WHERE c.vacancy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vacancies v WHERE v.id = c.vacancy_id)`,
    );
    expect(dangling[0]?.n).toBe(0);
  });
});
