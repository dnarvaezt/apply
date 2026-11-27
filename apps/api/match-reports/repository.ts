import { matchReports } from "@apply/db";
import type { CvMatchReport, MatchWeights } from "@apply/shared";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db.ts";
import { formatId, parseId } from "../ids.ts";

export type NewMatchReport = Omit<CvMatchReport, "createdAt"> & { cvHash: string };

const level = z.enum(["fuerte", "parcial", "débil"]);

/** Forma de `match_reports.report`: lo que la tabla no guarda en columnas propias. */
const ReportDetails = z.object({
  requirements: z.array(
    z.object({
      requirement: z.string(),
      kind: z.enum(["must", "nice"]),
      score: z.number(),
      level,
      evidence: z.object({ heading: z.string(), text: z.string() }).nullable(),
    }),
  ),
  keywords: z.object({
    found: z.array(z.string()),
    missing: z.array(z.string()),
    coverage: z.number(),
  }),
});

const Weights = z.object({ fuerte: z.number(), parcial: z.number(), débil: z.number() });

type Row = typeof matchReports.$inferSelect;

function toReport(row: Row): CvMatchReport {
  const details = ReportDetails.parse(row.report);
  return {
    cvId: formatId(row.cvId),
    vacancyId: formatId(row.vacancyId),
    coverage: row.score,
    requirements: details.requirements,
    keywords: details.keywords,
    model: row.model,
    embedModel: row.embedModel,
    weights: Weights.parse(row.weights) satisfies MatchWeights,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Informes de match del CV frente a su vacante (D6), uno por cálculo, ligados a `cv_id`. */
export function createMatchReportsRepository(db: Db) {
  return {
    async save(report: NewMatchReport): Promise<CvMatchReport> {
      const cvId = parseId(report.cvId);
      const vacancyId = parseId(report.vacancyId);
      if (cvId === null || vacancyId === null) throw new Error("Id de CV o de vacante inválido");
      const [row] = await db
        .insert(matchReports)
        .values({
          cvId,
          vacancyId,
          score: report.coverage,
          model: report.model,
          embedModel: report.embedModel,
          weights: report.weights,
          cvHash: report.cvHash,
          report: { requirements: report.requirements, keywords: report.keywords },
        })
        .returning();
      if (!row) throw new Error("No se pudo guardar el informe de match");
      return toReport(row);
    },

    /** El informe más reciente de ese contenido exacto del CV, calculado con ese algoritmo y modelo. */
    async latest(
      cvId: string,
      key: { cvHash: string; model: string; embedModel: string },
    ): Promise<CvMatchReport | null> {
      const numeric = parseId(cvId);
      if (numeric === null) return null;
      const [row] = await db
        .select()
        .from(matchReports)
        .where(
          and(
            eq(matchReports.cvId, numeric),
            eq(matchReports.cvHash, key.cvHash),
            eq(matchReports.model, key.model),
            eq(matchReports.embedModel, key.embedModel),
          ),
        )
        .orderBy(desc(matchReports.id))
        .limit(1);
      return row ? toReport(row) : null;
    },
  };
}

export type MatchReportsRepository = ReturnType<typeof createMatchReportsRepository>;
