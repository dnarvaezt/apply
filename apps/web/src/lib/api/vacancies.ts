import type { MatchReport, Vacancy } from "@apply/shared";
import { json, request } from "./http.ts";

export const vacanciesApi = {
  list: () => request<Vacancy[]>("/vacancies"),
  create: (input: { text?: string; url?: string }) =>
    request<Vacancy>("/vacancies", { method: "POST", body: json(input) }),
  remove: (id: string) => request(`/vacancies/${id}`, { method: "DELETE" }),
  match: (id: string) => request<MatchReport>(`/vacancies/${id}/match`),
};
