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
  /** Slug de la tabla `platforms` (`linkedin`, `manual`...). */
  platform: string;
  posterName: string | null;
  posterTitle: string | null;
  /** Solo http/https; nunca se descarga. */
  posterProfileUrl: string | null;
  /** ISO 8601; `null` si no se conoce. */
  postedAt: string | null;
  postedAtPrecision: PostedAtPrecision;
}

/** `exact`: fecha completa; `relative`: calculada desde "hace N días"; `unknown`: sin fecha. */
export type PostedAtPrecision = "exact" | "relative" | "unknown";

/** Campos que el usuario corrige a mano (`PATCH /vacancies/:id`); `postedAt` en AAAA-MM-DD. */
export interface VacancyManualFields {
  posterName?: string | null;
  posterTitle?: string | null;
  posterProfileUrl?: string | null;
  postedAt?: string | null;
}
