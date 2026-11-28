import type { Vacancy } from "@apply/shared";

export function vacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: "10",
    createdAt: "2026-11-20T10:00:00.000Z",
    sourceUrl: null,
    rawText: "Texto de la vacante",
    title: "Ingeniera Backend",
    company: "ACME",
    location: "Remoto",
    seniority: "Senior",
    language: "es",
    summary: "Construir APIs.",
    mustHave: ["TypeScript"],
    niceToHave: ["Docker"],
    responsibilities: [],
    keywords: ["typescript"],
    platform: "manual",
    posterName: null,
    posterTitle: null,
    posterProfileUrl: null,
    postedAt: null,
    postedAtPrecision: "unknown",
    status: "to_apply",
    discardReason: null,
    ...overrides,
  };
}
