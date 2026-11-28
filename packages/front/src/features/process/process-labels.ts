import type { DiscardReason, VacancyStatus } from "@apply/shared";

export const STATUS_LABEL: Record<VacancyStatus, string> = {
  to_apply: "Por postular",
  applied: "Postulada",
  contacted: "En contacto",
  interview: "Entrevista",
  assessment: "Prueba / documentos",
  offer: "Oferta",
  hired: "Contratada",
  discarded: "Descartada",
};

export const DISCARD_LABEL: Record<DiscardReason, string> = {
  rejected: "me rechazaron",
  withdrawn: "me retiré",
  closed: "vacante cerrada",
};

export type StatusTone = "idle" | "progress" | "positive" | "negative";

/** Tono de la insignia: sin empezar, en curso, buen o mal final. */
export const STATUS_TONE: Record<VacancyStatus, StatusTone> = {
  to_apply: "idle",
  applied: "progress",
  contacted: "progress",
  interview: "progress",
  assessment: "progress",
  offer: "positive",
  hired: "positive",
  discarded: "negative",
};

/** Estado para leer: "Descartada (me rechazaron)" lleva el motivo. */
export function statusText(status: VacancyStatus, reason: DiscardReason | null): string {
  const label = STATUS_LABEL[status];
  return status === "discarded" && reason ? `${label} (${DISCARD_LABEL[reason]})` : label;
}
