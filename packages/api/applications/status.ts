import {
  APPLICATION_STATUSES,
  type ApplicationEventType,
  type ApplicationStatus,
  type EventSource,
} from "@apply/shared";
import { CLASSIFIED } from "./classified.ts";

export interface IncomingEvent {
  type: ApplicationEventType;
  source: EventSource;
}

/** Rango de los estados activos; los terminales no tienen rango: ganan sobre cualquiera. */
const ACTIVE_RANK: Partial<Record<ApplicationStatus, number>> = {
  applied: 0,
  contacted: 1,
  interview: 2,
  offer: 3,
};

export function isTerminal(status: ApplicationStatus): boolean {
  return ACTIVE_RANK[status] === undefined;
}

export function isActive(status: ApplicationStatus): boolean {
  return !isTerminal(status);
}

/** Estados activos de rango igual o mayor que `from`; vacío si `from` es terminal. */
export function activeStatusesFrom(from: ApplicationStatus): ApplicationStatus[] {
  const min = ACTIVE_RANK[from] ?? Number.POSITIVE_INFINITY;
  return APPLICATION_STATUSES.filter((status) => (ACTIVE_RANK[status] ?? -1) >= min);
}

/** `reopened` solo se acepta con `source = manual` (REQ-005). */
export function canRecord(event: IncomingEvent): boolean {
  return event.type !== "reopened" || event.source === "manual";
}

/** El primer evento que clasifica según `CLASSIFIED` fija `classified_at` (REQ-006). */
export function isClassifying(type: ApplicationEventType): boolean {
  return CLASSIFIED.eventTypes.includes(type);
}

/** Estado en el que queda una postulación reabierta. */
const REOPENED_STATUS: ApplicationStatus = "applied";

/**
 * Regla pura de derivación: estado materializado tras recibir un evento.
 * - Un terminal es pegajoso: solo `reopened` manual lo reabre.
 * - Un evento activo de rango menor o igual no retrocede el estado.
 * - Un evento terminal cierra la postulación.
 */
export function next(current: ApplicationStatus, incoming: IncomingEvent): ApplicationStatus {
  if (isTerminal(current)) {
    return incoming.type === "reopened" && incoming.source === "manual" ? REOPENED_STATUS : current;
  }
  if (incoming.type === "reopened") return current;
  const incomingRank = ACTIVE_RANK[incoming.type];
  if (incomingRank === undefined) return incoming.type;
  return incomingRank > (ACTIVE_RANK[current] as number) ? incoming.type : current;
}
