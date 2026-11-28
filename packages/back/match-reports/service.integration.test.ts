import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { matchReports } from "#db";
import { createCvsRepository } from "../cvs/repository.ts";
import { EMBED_MODEL, embed } from "../rag/embed.ts";
import { newVacancy } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { LABELED_CV, LABELED_EXPECTED, LABELED_VACANCY } from "./labeled-fixture.ts";
import { MATCH_MODEL } from "./match.ts";
import { createMatchReportsRepository } from "./repository.ts";
import { createCvMatcher } from "./service.ts";

let iso: IsolatedDb;
let embedCalls: number;

function deps() {
  return {
    cvs: createCvsRepository(iso.db),
    vacancies: createVacanciesRepository(iso.db),
    reportFor: createCvMatcher({
      repo: createMatchReportsRepository(iso.db),
      embedModel: EMBED_MODEL,
      embed: async (texts, kind) => {
        embedCalls++;
        return embed(texts, kind);
      },
    }),
  };
}

async function labeledPair() {
  const { cvs, vacancies, reportFor } = deps();
  const vacancy = await vacancies.create(newVacancy(LABELED_VACANCY));
  const cv = await cvs.create({
    vacancyId: vacancy.id,
    title: "CV etiquetado",
    markdown: LABELED_CV,
    language: "es",
  });
  return { cvs, vacancy, cv, reportFor };
}

beforeAll(async () => {
  iso = await createIsolatedDb();
  await embed(["calentamiento"], "passage");
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  embedCalls = 0;
  await iso.db.execute(
    sql`TRUNCATE match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
});

describe("informe de match del CV contra su vacante", () => {
  it("AC-003: con el fixture etiquetado cada requisito obtiene el nivel esperado (C9)", async () => {
    const { vacancy, cv, reportFor } = await labeledPair();
    const report = await reportFor(cv, vacancy);

    expect(
      report.requirements.map(({ requirement, kind, level }) => ({ requirement, kind, level })),
    ).toEqual(LABELED_EXPECTED);
    // La evidencia sale del CV generado y acompaña a todo nivel no débil.
    for (const r of report.requirements) {
      if (r.level === "débil") expect(r.evidence).toBeNull();
      else expect(LABELED_CV).toContain(r.evidence?.text.replace(/…$/, ""));
    }
    expect(report.requirements[0].evidence?.heading).toBe(
      "Ana Pérez > Experiencia > ACME Pagos (2020–2025)",
    );
    // 2 fuertes + 1 parcial + 1 débil de 4 mustHave
    expect(report.coverage).toBe(0.625);
    expect(report.keywords).toEqual({
      found: ["TypeScript", "Node.js", "PostgreSQL"],
      missing: ["Kubernetes", "Java"],
      coverage: 0.6,
    });
  });

  it("AC-005: el informe queda en match_reports con cv_id, modelo, embed_model y pesos", async () => {
    const { vacancy, cv, reportFor } = await labeledPair();
    const report = await reportFor(cv, vacancy);

    const rows = await iso.db.select().from(matchReports);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cvId: Number(cv.id),
      vacancyId: Number(vacancy.id),
      score: 0.625,
      model: MATCH_MODEL,
      embedModel: EMBED_MODEL,
      weights: { fuerte: 1, parcial: 0.5, débil: 0 },
    });
    expect(rows[0].cvHash).toMatch(/^[0-9a-f]{64}$/);
    expect(report).toMatchObject({ cvId: cv.id, vacancyId: vacancy.id, model: MATCH_MODEL });
  });

  it("AC-004: dos cálculos seguidos del mismo par devuelven informes iguales", async () => {
    const { vacancy, cv, reportFor } = await labeledPair();
    const first = await reportFor(cv, vacancy);
    await iso.db.execute(sql`TRUNCATE match_reports`);
    const second = await reportFor(cv, vacancy);

    const { createdAt: _a, ...a } = first;
    const { createdAt: _b, ...b } = second;
    expect(b).toEqual(a);
  });

  it("reutiliza el informe guardado del mismo contenido sin volver a embeber", async () => {
    const { vacancy, cv, reportFor } = await labeledPair();
    const first = await reportFor(cv, vacancy);
    const calls = embedCalls;
    expect(await reportFor(cv, vacancy)).toEqual(first);
    expect(embedCalls).toBe(calls);
    expect(await iso.db.select().from(matchReports)).toHaveLength(1);
  });

  it("editar el CV produce un informe nuevo con su contenido", async () => {
    const { cvs, vacancy, cv, reportFor } = await labeledPair();
    await reportFor(cv, vacancy);
    const edited = await cvs.update(cv.id, {
      markdown: `${LABELED_CV}\n## Herramientas\n\nKubernetes y Java.\n`,
    });
    if (!edited) throw new Error("el CV debía existir");

    const report = await reportFor(edited, vacancy);
    expect(report.keywords.missing).toEqual([]);
    expect(await iso.db.select().from(matchReports)).toHaveLength(2);
  });

  it("un CV sin texto mide todo débil, sin embeber fragmentos", async () => {
    const { cvs, vacancies, reportFor } = deps();
    const vacancy = await vacancies.create(newVacancy(LABELED_VACANCY));
    const cv = await cvs.create({
      vacancyId: vacancy.id,
      title: "vacío",
      markdown: "",
      language: "es",
    });

    const report = await reportFor(cv, vacancy);
    expect(report.requirements.every((r) => r.level === "débil")).toBe(true);
    expect(report.coverage).toBe(0);
    expect(embedCalls).toBe(1); // solo los requisitos
  });
});
