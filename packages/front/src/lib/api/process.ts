import type { MoveStatusRequest, VacancyProcess } from "@apply/shared";
import { json, request } from "./http.ts";

export const processApi = {
  /** Estado, historial y contactos de la vacante (#80). */
  get: (vacancyId: string) =>
    request<VacancyProcess>(`/vacancies/${encodeURIComponent(vacancyId)}/process`),
  /** Mueve la vacante a otro estado; responde el proceso actualizado. */
  move: (vacancyId: string, req: MoveStatusRequest) =>
    request<VacancyProcess>(`/vacancies/${encodeURIComponent(vacancyId)}/status`, {
      method: "POST",
      body: json(req),
    }),
};
