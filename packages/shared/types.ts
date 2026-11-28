export interface ProfileFile {
  name: string;
  content: string;
  updatedAt: string;
}

/** Cómo se listan los archivos del perfil: el orden manual guardado o alfabético. */
export interface ProfileOrder {
  mode: "custom" | "alpha";
  order: string[];
}

export interface IndexStatus {
  builtAt: string | null;
  files: number;
  chunks: number;
  /** true si algún archivo del perfil cambió después de construir el índice */
  stale: boolean;
  model: string;
}

export interface RetrievedChunk {
  id: string;
  file: string;
  heading: string;
  text: string;
  score: number;
}

export type MatchLevel = "fuerte" | "parcial" | "débil";

export interface RequirementMatch {
  requirement: string;
  kind: "must" | "nice";
  score: number;
  level: MatchLevel;
  evidence: { file: string; heading: string } | null;
}

export interface MatchReport {
  vacancyId: string;
  coverage: number;
  requirements: RequirementMatch[];
  chunks: RetrievedChunk[];
}
