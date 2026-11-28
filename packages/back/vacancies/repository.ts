import type { Vacancy } from "@apply/shared";
import { desc, eq } from "drizzle-orm";
import { companies, cvs, matchReports, platforms, vacancies } from "#db";
import { upsertCompany } from "../companies/repository.ts";
import type { Db, Executor } from "../db.ts";
import { formatId, parseId } from "../ids.ts";
import type { VacancyChanges } from "./manual-fields.ts";
import { resolvePostedAt } from "./posted-at.ts";
import { vacancySource } from "./source.ts";

/** `fromImage` solo decide la columna `source`: no forma parte del contrato `Vacancy`. */
export type NewVacancy = Omit<Vacancy, "id" | "createdAt"> & { fromImage?: boolean };

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
  platform: platforms.slug,
  posterName: vacancies.posterName,
  posterTitle: vacancies.posterTitle,
  posterProfileUrl: vacancies.posterProfileUrl,
  postedAt: vacancies.postedAt,
  postedAtPrecision: vacancies.postedAtPrecision,
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
    platform: row.platform as string,
    posterName: row.posterName,
    posterTitle: row.posterTitle,
    posterProfileUrl: row.posterProfileUrl,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    postedAtPrecision: row.postedAtPrecision as Vacancy["postedAtPrecision"],
  };
}

async function toRow(
  tx: Executor,
  input: NewVacancy,
  createdAt: Date,
): Promise<typeof vacancies.$inferInsert> {
  const [platform] = await tx
    .select({ id: platforms.id })
    .from(platforms)
    .where(eq(platforms.slug, input.platform));
  if (!platform) {
    throw new Error(`Falta la plataforma '${input.platform}'; corre \`npm run db:migrate\``);
  }
  return {
    platformId: platform.id,
    source: vacancySource(input),
    sourceUrl: input.sourceUrl,
    companyId: await upsertCompany(tx, input.company),
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
    posterName: input.posterName,
    posterTitle: input.posterTitle,
    posterProfileUrl: input.posterProfileUrl,
    postedAt: input.postedAt ? new Date(input.postedAt) : null,
    postedAtPrecision: input.postedAtPrecision,
    createdAt,
  };
}

export function createVacanciesRepository(db: Db) {
  const select = () =>
    db
      .select(columns)
      .from(vacancies)
      .leftJoin(companies, eq(vacancies.companyId, companies.id))
      .leftJoin(platforms, eq(vacancies.platformId, platforms.id));

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

    /** `createdAt` es también la referencia de las fechas relativas (REQ-002). */
    async create(input: NewVacancy, createdAt = new Date()): Promise<Vacancy> {
      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(vacancies)
          .values(await toRow(tx, input, createdAt))
          .returning({ id: vacancies.id });
        if (!row) throw new Error("No se pudo guardar la vacante");
        return row.id;
      });
      const created = await get(formatId(id));
      if (!created) throw new Error("No se pudo leer la vacante guardada");
      return created;
    },

    /**
     * Inserta una vacante de `data/` con su id viejo (#14). `skipped` si ese id ya se importó:
     * repetir la importación no duplica ni pisa lo editado después.
     */
    async importLegacy(
      legacyId: string,
      input: NewVacancy,
      createdAt: Date,
    ): Promise<"imported" | "skipped"> {
      return db.transaction(async (tx) => {
        const rows = await tx
          .insert(vacancies)
          .values({ ...(await toRow(tx, input, createdAt)), legacyId })
          .onConflictDoNothing({ target: vacancies.legacyId })
          .returning({ id: vacancies.id });
        return rows.length > 0 ? "imported" : "skipped";
      });
    },

    /** Aplica las correcciones manuales (REQ-005, #73); `null` si la vacante no existe. */
    async update(id: string, fields: VacancyChanges): Promise<Vacancy | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const { postedAt, company, ...rest } = fields;
      const changes: Partial<typeof vacancies.$inferInsert> = { ...rest };
      if (company !== undefined) changes.companyId = await upsertCompany(db, company);
      if (postedAt !== undefined) {
        const resolved = resolvePostedAt({ manual: postedAt }, new Date());
        changes.postedAt = resolved.postedAt;
        changes.postedAtPrecision = resolved.precision;
      }
      if (Object.keys(changes).length > 0) {
        await db.update(vacancies).set(changes).where(eq(vacancies.id, numeric));
      }
      return get(id);
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
