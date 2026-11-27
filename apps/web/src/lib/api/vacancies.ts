import type { MatchReport, Vacancy, VacancyManualFields } from "@apply/shared";
import { json, request } from "./http.ts";

export const vacanciesApi = {
  list: () => request<Vacancy[]>("/vacancies"),
  create: (
    input: {
      text?: string;
      url?: string;
      image?: { mediaType: string; data: string };
    } & VacancyManualFields,
  ) => request<Vacancy>("/vacancies", { method: "POST", body: json(input) }),
  /** Corrige a mano poster y fecha de publicación. */
  update: (id: string, fields: VacancyManualFields) =>
    request<Vacancy>(`/vacancies/${id}`, { method: "PATCH", body: json(fields) }),
  remove: (id: string) => request(`/vacancies/${id}`, { method: "DELETE" }),
  match: (id: string) => request<MatchReport>(`/vacancies/${id}/match`),
};
