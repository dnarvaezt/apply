import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applications, cvs, matchReports, outboundEmails } from "#db";
import { newVacancy } from "../../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../../test/test-db.ts";
import { createVacanciesRepository } from "../../vacancies/repository.ts";

// La migración 0010 (#76) deja un único CV por vacante. Se reproduce el estado previo (índice no
// único y varios CVs por vacante) y se aplican las sentencias reales del archivo de migración.
const MIGRATION = readFileSync(
  path.resolve(import.meta.dirname, "../drizzle/0010_single_cv_per_vacancy.sql"),
  "utf8",
);

let iso: IsolatedDb;

beforeAll(async () => {
  iso = await createIsolatedDb();
});

afterAll(async () => {
  await iso.drop();
});

async function insertCv(vacancyId: number | null, title: string, createdAt: string) {
  const [row] = await iso.db
    .insert(cvs)
    .values({
      vacancyId,
      title,
      content: `# ${title}`,
      language: "es",
      createdAt: new Date(createdAt),
    })
    .returning({ id: cvs.id });
  if (!row) throw new Error("no se insertó el CV");
  return row.id;
}

describe("migración 0010: un único CV por vacante (#76)", () => {
  it("se queda el CV más reciente y le pasa las postulaciones y los correos de los demás", async () => {
    await iso.db.execute(sql`DROP INDEX "cvs_vacancy_id_uq"`);
    await iso.db.execute(sql`CREATE INDEX "cvs_vacancy_id_idx" ON "cvs" ("vacancy_id")`);

    const vacancies = createVacanciesRepository(iso.db);
    const a = Number((await vacancies.create(newVacancy({ title: "A" }))).id);
    const b = Number((await vacancies.create(newVacancy({ title: "B" }))).id);
    const oldA = await insertCv(a, "viejo A", "2026-01-01T00:00:00Z");
    const newA = await insertCv(a, "nuevo A", "2026-02-01T00:00:00Z");
    const onlyB = await insertCv(b, "solo B", "2026-01-15T00:00:00Z");
    const looseOne = await insertCv(null, "suelto 1", "2026-01-01T00:00:00Z");
    const looseTwo = await insertCv(null, "suelto 2", "2026-01-02T00:00:00Z");

    const [app] = await iso.db
      .insert(applications)
      .values({ vacancyId: a, cvId: oldA })
      .returning({ id: applications.id });
    const [draft] = await iso.db
      .insert(outboundEmails)
      .values({ cvId: oldA, subject: "S", body: "B", language: "es" })
      .returning({ id: outboundEmails.id });
    await iso.db.insert(matchReports).values({
      cvId: oldA,
      vacancyId: a,
      score: 0.5,
      model: "m",
      embedModel: "e",
      weights: {},
      cvHash: "h",
      report: {},
    });

    for (const statement of MIGRATION.split("--> statement-breakpoint")) {
      await iso.db.execute(sql.raw(statement));
    }

    const left = await iso.db.select({ id: cvs.id }).from(cvs).orderBy(cvs.id);
    expect(left.map((r) => r.id)).toEqual([newA, onlyB, looseOne, looseTwo]);
    const [linkedApp] = await iso.db
      .select({ cvId: applications.cvId })
      .from(applications)
      .where(eq(applications.id, app?.id ?? -1));
    expect(linkedApp?.cvId).toBe(newA);
    const [linkedDraft] = await iso.db
      .select({ cvId: outboundEmails.cvId })
      .from(outboundEmails)
      .where(eq(outboundEmails.id, draft?.id ?? -1));
    expect(linkedDraft?.cvId).toBe(newA);
    expect(await iso.db.select().from(matchReports)).toHaveLength(0);

    await expect(insertCv(a, "otro A", "2026-03-01T00:00:00Z")).rejects.toThrow();
  });
});
