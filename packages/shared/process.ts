import type { ApplicationContact } from "./contact.ts";

/**
 * Estados de la vacante en su proceso (#80), en el orden del flujo. Se puede mover de
 * cualquiera a cualquiera; `discarded` exige un motivo.
 */
export const VACANCY_STATUSES = [
  "to_apply",
  "applied",
  "contacted",
  "interview",
  "assessment",
  "offer",
  "hired",
  "discarded",
] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

/** Por qué se descartó: me rechazaron, me retiré o la vacante se cerró. */
export const DISCARD_REASONS = ["rejected", "withdrawn", "closed"] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/** Quién movió el estado: la persona, o la app (envío del correo, respuesta de Gmail). */
export type ChangeSource = "auto" | "manual";

/** Un cambio de estado del historial; el primero de la vacante tiene `from = null`. */
export interface StatusChange {
  id: string;
  from: VacancyStatus | null;
  to: VacancyStatus;
  discardReason: DiscardReason | null;
  note: string | null;
  /** Slug del canal por el que ocurrió (`email`, `linkedin`, ...). */
  channel: string | null;
  source: ChangeSource;
  occurredAt: string;
  createdAt: string;
}

/** Proceso de la vacante: estado actual, historial (más reciente primero) y contactos. */
export interface VacancyProcess {
  vacancyId: string;
  status: VacancyStatus;
  discardReason: DiscardReason | null;
  history: StatusChange[];
  contacts: ApplicationContact[];
}

/** `POST /vacancies/:id/status`: mueve la vacante a `to`. */
export interface MoveStatusRequest {
  to: VacancyStatus;
  /** Obligatorio si `to` es `discarded`; prohibido en otro caso. */
  discardReason?: DiscardReason | null;
  note?: string | null;
  channel?: string | null;
  /** ISO 8601; por defecto, ahora. No puede ser futura. */
  occurredAt?: string;
}
