import type { CvDoc, CvMeta } from "@apply/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { applications, cvs, matchReports, outboundEmails, vacancies } from "#db";
import type { Db, Executor } from "../db.ts";
import { formatId, parseId } from "../ids.ts";

export interface NewCv {
  vacancyId: string | null;
  title: string;
  markdown: string;
  language: string;
}

const meta = {
  id: cvs.id,
  vacancyId: cvs.vacancyId,
  title: cvs.title,
  createdAt: cvs.createdAt,
  updatedAt: cvs.updatedAt,
};

function toMeta(row: {
  id: number;
  vacancyId: number | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}): CvMeta {
  return {
    id: formatId(row.id),
    vacancyId: row.vacancyId === null ? null : formatId(row.vacancyId),
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Borra el CV, sus informes de match y sus borradores sin postulación; las postulaciones y los
 * correos ya ligados a una postulación quedan sin CV.
 */
async function deleteCv(tx: Executor, id: number): Promise<void> {
  await tx.delete(matchReports).where(eq(matchReports.cvId, id));
  await tx.update(applications).set({ cvId: null }).where(eq(applications.cvId, id));
  await tx
    .delete(outboundEmails)
    .where(and(eq(outboundEmails.cvId, id), isNull(outboundEmails.applicationId)));
  await tx.update(outboundEmails).set({ cvId: null }).where(eq(outboundEmails.cvId, id));
  await tx.delete(cvs).where(eq(cvs.id, id));
}

export function createCvsRepository(db: Db) {
  return {
    /** Los editados más recientemente primero. */
    async list(): Promise<CvMeta[]> {
      const rows = await db.select(meta).from(cvs).orderBy(desc(cvs.updatedAt), desc(cvs.id));
      return rows.map(toMeta);
    },

    async get(id: string): Promise<CvDoc | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const [row] = await db
        .select({ ...meta, markdown: cvs.content })
        .from(cvs)
        .where(eq(cvs.id, numeric));
      return row ? { ...toMeta(row), markdown: row.markdown } : null;
    },

    async create(input: NewCv): Promise<CvDoc> {
      const vacancyId = input.vacancyId === null ? null : parseId(input.vacancyId);
      const [row] = await db
        .insert(cvs)
        .values({
          vacancyId,
          title: input.title,
          content: input.markdown,
          language: input.language,
        })
        .returning({ ...meta, markdown: cvs.content });
      if (!row) throw new Error("No se pudo guardar el CV");
      return { ...toMeta(row), markdown: row.markdown };
    },

    /**
     * El CV de la vacante (#76): regenerar elimina el CV actual, con su mensaje de correo, y crea
     * uno nuevo en la misma transacción, así la vacante nunca queda con dos CVs ni sin ninguno.
     */
    async saveForVacancy(input: NewCv & { vacancyId: string }): Promise<CvDoc> {
      const vacancyId = parseId(input.vacancyId);
      if (vacancyId === null) throw new Error(`Id de vacante inválido: ${input.vacancyId}`);
      const row = await db.transaction(async (tx) => {
        const current = await tx
          .select({ id: cvs.id })
          .from(cvs)
          .where(eq(cvs.vacancyId, vacancyId));
        for (const { id } of current) await deleteCv(tx, id);
        const [inserted] = await tx
          .insert(cvs)
          .values({
            vacancyId,
            title: input.title,
            content: input.markdown,
            language: input.language,
          })
          .returning({ ...meta, markdown: cvs.content });
        return inserted;
      });
      if (!row) throw new Error("No se pudo guardar el CV");
      return { ...toMeta(row), markdown: row.markdown };
    },

    /**
     * Inserta un CV de `data/` con su id viejo y sus fechas (#14). `skipped` si ese id ya se
     * importó. `vacancyLegacyId` sin vacante importada deja el CV sin vacante, como al borrarla.
     */
    async importLegacy(cv: {
      legacyId: string;
      vacancyLegacyId: string | null;
      title: string;
      markdown: string;
      createdAt: Date;
      updatedAt: Date;
    }): Promise<"imported" | "skipped"> {
      const [vacancy] =
        cv.vacancyLegacyId === null
          ? []
          : await db
              .select({ id: vacancies.id, language: vacancies.language })
              .from(vacancies)
              .where(eq(vacancies.legacyId, cv.vacancyLegacyId));
      const rows = await db
        .insert(cvs)
        .values({
          legacyId: cv.legacyId,
          vacancyId: vacancy?.id ?? null,
          title: cv.title,
          content: cv.markdown,
          // Los archivos no guardaban el idioma del CV: se hereda de su vacante.
          language: vacancy?.language ?? "es",
          createdAt: cv.createdAt,
          updatedAt: cv.updatedAt,
        })
        .onConflictDoNothing({ target: cvs.legacyId })
        .returning({ id: cvs.id });
      return rows.length > 0 ? "imported" : "skipped";
    },

    /** `null` si el CV no existe. Un título vacío conserva el actual. */
    async update(id: string, changes: { markdown: string; title?: string }): Promise<CvDoc | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const title = changes.title?.trim();
      const [row] = await db
        .update(cvs)
        .set({
          content: changes.markdown,
          ...(title ? { title } : {}),
          updatedAt: new Date(),
        })
        .where(eq(cvs.id, numeric))
        .returning({ ...meta, markdown: cvs.content });
      return row ? { ...toMeta(row), markdown: row.markdown } : null;
    },

    /** Borra el CV y lo que cuelga de él (ver `deleteCv`). Idempotente. */
    async remove(id: string): Promise<void> {
      const numeric = parseId(id);
      if (numeric === null) return;
      await db.transaction((tx) => deleteCv(tx, numeric));
    },
  };
}

export type CvsRepository = ReturnType<typeof createCvsRepository>;
