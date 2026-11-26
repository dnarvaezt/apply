import type { ExtractedVacancy } from "../llm.ts";
import type { NewVacancy } from "../vacancies/repository.ts";

export function extracted(overrides: Partial<ExtractedVacancy> = {}): ExtractedVacancy {
  return {
    title: "Ingeniero Backend",
    company: "ACME S.A.",
    location: "Remoto",
    seniority: "Senior",
    language: "es",
    summary: "Construir APIs.",
    mustHave: ["TypeScript", "PostgreSQL"],
    niceToHave: ["Docker"],
    responsibilities: ["Diseñar servicios"],
    keywords: ["node", "sql"],
    ...overrides,
  };
}

export function newVacancy(overrides: Partial<NewVacancy> = {}): NewVacancy {
  return {
    sourceUrl: null,
    rawText: "Texto original de la vacante ".repeat(5),
    ...extracted(),
    ...overrides,
  };
}
