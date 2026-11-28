import type { DiscardReason, VacancyStatus } from "@apply/shared";

export interface Move {
  to: VacancyStatus;
  discardReason?: DiscardReason | null;
}

/**
 * Regla del movimiento manual (#80): cualquier estado a cualquier otro, como en Jira.
 * Devuelve el motivo del rechazo, o `null` si el movimiento vale.
 */
export function moveError(current: VacancyStatus, move: Move): string | null {
  const discarding = move.to === "discarded";
  const hasReason = move.discardReason != null;
  if (move.to === current) return "La vacante ya está en ese estado";
  if (discarding && !hasReason) return "Indica el motivo del descarte";
  if (!discarding && hasReason) return "El motivo solo aplica al descartar";
  return null;
}

/** Orden de avance de los estados abiertos; Contratada y Descartada cierran el proceso. */
const FLOW_RANK: Partial<Record<VacancyStatus, number>> = {
  to_apply: 0,
  applied: 1,
  contacted: 2,
  interview: 3,
  assessment: 4,
  offer: 5,
};

/**
 * La app (envío del correo, respuesta en Gmail) solo hace avanzar el proceso: nunca retrocede,
 * nunca reabre una vacante cerrada y nunca la cierra por su cuenta.
 */
export function advancesAutomatically(current: VacancyStatus, target: VacancyStatus): boolean {
  const from = FLOW_RANK[current];
  const to = FLOW_RANK[target];
  return from !== undefined && to !== undefined && to > from;
}
