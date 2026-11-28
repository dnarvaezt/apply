import type { MatchReport, Vacancy, VacancyChanges, VacancyManualFields } from "@apply/shared";
import { json, request } from "./http.ts";

export const vacanciesApi = {
  list: () => request<Vacancy[]>("/vacancies"),
  get: (id: string) => request<Vacancy>(`/vacancies/${encodeURIComponent(id)}`),
  create: (
    input: {
      text?: string;
      url?: string;
      /** Con `url`: Claude abre la página con el MCP de Chrome en vez de descargarla. */
      browser?: boolean;
      image?: { mediaType: string; data: string };
    } & VacancyManualFields,
  ) => request<Vacancy>("/vacancies", { method: "POST", body: json(input) }),
  /** Corrige a mano la vacante: título, empresa, resumen, poster y fecha de publicación. */
  update: (id: string, fields: VacancyChanges) =>
    request<Vacancy>(`/vacancies/${id}`, { method: "PATCH", body: json(fields) }),
  remove: (id: string) => request(`/vacancies/${id}`, { method: "DELETE" }),
  match: (id: string) => request<MatchReport>(`/vacancies/${id}/match`),
};
