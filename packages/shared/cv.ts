import type { MatchLevel } from "./types.ts";

export interface CvMeta {
  id: string;
  vacancyId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CvDoc extends CvMeta {
  markdown: string;
}

export interface GenerateCvRequest {
  vacancyId: string;
  instructions?: string;
}

/** Pesos de la cobertura ponderada de `mustHave` por nivel (D6). */
export interface MatchWeights {
  fuerte: number;
  parcial: number;
  débil: number;
}

/** Nivel de un requisito contra el CV generado, con el fragmento del CV que lo respalda. */
export interface CvRequirementMatch {
  requirement: string;
  kind: "must" | "nice";
  score: number;
  level: MatchLevel;
  evidence: { heading: string; text: string } | null;
}

/** Coincidencias exactas de las keywords de la vacante en el CV, con límites de palabra. */
export interface KeywordCoverage {
  found: string[];
  missing: string[];
  /** found / total; 1 si la vacante no tiene keywords. */
  coverage: number;
}

/**
 * Informe determinista del CV frente a su vacante (D6): sin puntaje global combinado ni LLM.
 * `coverage` es la cobertura ponderada de `mustHave`.
 */
export interface CvMatchReport {
  cvId: string;
  vacancyId: string;
  coverage: number;
  requirements: CvRequirementMatch[];
  keywords: KeywordCoverage;
  model: string;
  embedModel: string;
  weights: MatchWeights;
  createdAt: string;
}
