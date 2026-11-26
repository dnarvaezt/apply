export interface ProfileFile {
  name: string;
  content: string;
  updatedAt: string;
}

export interface IndexStatus {
  builtAt: string | null;
  files: number;
  chunks: number;
  /** true si algún archivo del perfil cambió después de construir el índice */
  stale: boolean;
  model: string;
}

export interface Vacancy {
  id: string;
  createdAt: string;
  sourceUrl: string | null;
  rawText: string;
  title: string;
  company: string;
  location: string | null;
  seniority: string | null;
  language: "es" | "en";
  summary: string;
  mustHave: string[];
  niceToHave: string[];
  responsibilities: string[];
  keywords: string[];
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
