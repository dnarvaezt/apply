import { companies, cvs, matchReports, platforms, vacancies } from "@apply/db";
import type { Vacancy } from "@apply/shared";
import { desc, eq } from "drizzle-orm";
import { upsertCompany } from "../companies/repository.ts";
import type { Db } from "../db.ts";
import { formatId, parseId } from "../ids.ts";

export type NewVacancy = Omit<Vacancy, "id" | "createdAt">;

/** Plataforma de las vacantes creadas desde la web (texto pegado o URL); la semilla es la migración 0004. */
const MANUAL_PLATFORM = "manual";

const columns = {
  id: vacancies.id,
  createdAt: vacancies.createdAt,
  sourceUrl: vacancies.sourceUrl,
  rawText: vacancies.description,
  title: vacancies.title,
  company: companies.name,
  location: vacancies.location,
  seniority: vacancies.seniority,
  language: vacancies.language,
  summary: vacancies.summary,
  mustHave: vacancies.mustHave,
  niceToHave: vacancies.niceToHave,
  responsibilities: vacancies.responsibilities,
  keywords: vacancies.keywords,
};

type Row = {
  [K in keyof typeof columns]: (typeof columns)[K]["_"]["data"] | null;
};

function toVacancy(row: Row): Vacancy {
  return {
    id: formatId(row.id as number),
    createdAt: (row.createdAt as Date).toISOString(),
    sourceUrl: row.sourceUrl,
    rawText: row.rawText ?? "",
    title: row.title as string,
    company: row.company ?? "",
    location: row.location,
    seniority: row.seniority,
    language: row.language as Vacancy["language"],
    summary: row.summary as string,
    mustHave: row.mustHave as string[],
    niceToHave: row.niceToHave as string[],
    responsibilities: row.responsibilities as string[],
    keywords: row.keywords as string[],
  };
}

export function createVacanciesRepository(db: Db) {
  const select = () =>
    db.select(columns).from(vacancies).leftJoin(companies, eq(vacancies.companyId, companies.id));

  async function get(id: string): Promise<Vacancy | null> {
    const numeric = parseId(id);
    if (numeric === null) return null;
    const [row] = await select().where(eq(vacancies.id, numeric));
    return row ? toVacancy(row) : null;
  }

  return {
    get,

    /** Más recientes primero. */
    async list(): Promise<Vacancy[]> {
      const rows = await select().orderBy(desc(vacancies.createdAt), desc(vacancies.id));
      return rows.map(toVacancy);
    },

    async create(input: NewVacancy): Promise<Vacancy> {
      const id = await db.transaction(async (tx) => {
        const [platform] = await tx
          .select({ id: platforms.id })
          .from(platforms)
          .where(eq(platforms.slug, MANUAL_PLATFORM));
        if (!platform) throw new Error("Falta la plataforma 'manual'; corre `npm run db:migrate`");
        const companyId = await upsertCompany(tx, input.company);
        const [row] = await tx
          .insert(vacancies)
          .values({
            platformId: platform.id,
            source: input.sourceUrl ? "url" : "text",
            sourceUrl: input.sourceUrl,
            companyId,
            title: input.title,
            description: input.rawText,
            location: input.location,
            seniority: input.seniority,
            language: input.language,
            summary: input.summary,
            mustHave: input.mustHave,
            niceToHave: input.niceToHave,
            responsibilities: input.responsibilities,
            keywords: input.keywords,
          })
          .returning({ id: vacancies.id });
        if (!row) throw new Error("No se pudo guardar la vacante");
        return row.id;
      });
      const created = await get(formatId(id));
      if (!created) throw new Error("No se pudo leer la vacante guardada");
      return created;
    },

    /**
     * Borra la vacante y sus informes de match; los CVs sobreviven con `vacancy_id` nulo
     * (hoy el CV también queda aunque se borre su vacante). Idempotente.
     */
    async remove(id: string): Promise<void> {
      const numeric = parseId(id);
      if (numeric === null) return;
      await db.transaction(async (tx) => {
        await tx.delete(matchReports).where(eq(matchReports.vacancyId, numeric));
        await tx.update(cvs).set({ vacancyId: null }).where(eq(cvs.vacancyId, numeric));
        await tx.delete(vacancies).where(eq(vacancies.id, numeric));
      });
    },
  };
}

export type VacanciesRepository = ReturnType<typeof createVacanciesRepository>;
