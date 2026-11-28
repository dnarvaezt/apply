import type {
  Application,
  ApplicationEvent,
  ApplicationEventType,
  ApplicationStatus,
  Channel,
  EventSource,
} from "@apply/shared";

export const EVENT_LABEL: Record<ApplicationEventType, string> = {
  applied: "Postulada",
  contacted: "Contactada",
  interview: "Entrevista",
  assessment: "Prueba técnica",
  offer: "Oferta",
  offer_accepted: "Oferta aceptada",
  offer_declined: "Oferta declinada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
  closed: "Cerrada sin resultado",
  reopened: "Reabierta",
  note: "Nota",
  follow_up: "Seguimiento",
};

/** Tipos del formulario de eventos: los que cambian el estado y los que solo registran. */
export const EVENT_GROUPS: { label: string; types: ApplicationEventType[] }[] = [
  {
    label: "Cambia el estado",
    types: [
      "contacted",
      "interview",
      "assessment",
      "offer",
      "offer_accepted",
      "offer_declined",
      "rejected",
      "withdrawn",
      "closed",
      "reopened",
    ],
  },
  { label: "Solo registra", types: ["note", "follow_up"] },
];

export const STATUS_LABEL: Record<ApplicationStatus, string> = EVENT_LABEL;

export const SOURCE_LABEL: Record<EventSource, string> = { auto: "automático", manual: "manual" };

/** Eventos por fecha en que ocurrieron; a igual fecha, en el orden en que se registraron. */
export function chronological(events: ApplicationEvent[]): ApplicationEvent[] {
  return [...events].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Nombre del canal para mostrar; un slug sin fila se muestra tal cual. */
export function channelLabel(channels: Channel[], slug: string | null): string {
  if (slug === null) return "sin canal";
  return channels.find((c) => c.slug === slug)?.name ?? slug;
}

/** Valor `datetime-local` (hora local, minutos) del instante dado. */
export function toLocalInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** `datetime-local` a ISO; vacío no envía fecha y la API usa el momento actual. */
export function localInputToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

/** La postulación que representa a la vacante: la activa o, si todas cerraron, la última actualizada. */
export function currentApplication(applications: Application[]): Application | null {
  const sorted = [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sorted.find((a) => a.active) ?? sorted[0] ?? null;
}

const MILESTONES = ["applied", "contacted", "interview", "assessment", "offer"] as const;

/** Hitos del proceso; uno está alcanzado si la línea de tiempo tiene un evento de ese tipo. */
export function statusSteps(events: Pick<ApplicationEvent, "type">[]) {
  const seen = new Set(events.map((e) => e.type));
  return MILESTONES.map((type) => ({ type, label: EVENT_LABEL[type], reached: seen.has(type) }));
}

export type StatusTone = "progress" | "positive" | "negative";

/** Tono de la insignia de cada estado: en curso, buen o mal final. */
export const STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  applied: "progress",
  contacted: "progress",
  interview: "progress",
  assessment: "progress",
  offer: "positive",
  offer_accepted: "positive",
  offer_declined: "negative",
  rejected: "negative",
  withdrawn: "negative",
  closed: "negative",
};
