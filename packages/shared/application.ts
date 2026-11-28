import type { ApplicationContact } from "./contact.ts";

export const APPLICATION_STATUSES = [
  "applied",
  "contacted",
  "interview",
  "assessment",
  "offer",
  "offer_accepted",
  "offer_declined",
  "rejected",
  "withdrawn",
  "closed",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Eventos que registran lo que pasó sin cambiar el estado de la postulación. */
export const INFO_EVENT_TYPES = ["note", "follow_up"] as const;
export type InfoEventType = (typeof INFO_EVENT_TYPES)[number];

/** Tipo de evento: los estados, `reopened` (solo manual) y los informativos. */
export type ApplicationEventType = ApplicationStatus | "reopened" | InfoEventType;
export type EventSource = "auto" | "manual";

export interface Application {
  id: string;
  vacancyId: string;
  cvId: string | null;
  status: ApplicationStatus;
  /** `true` si el estado no es terminal. */
  active: boolean;
  /** Fecha del primer evento `interview` u `offer`; no cambia después. */
  classifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string;
  type: ApplicationEventType;
  occurredAt: string;
  /** Slug del canal (`email`, `linkedin`, ...). */
  channel: string | null;
  source: EventSource;
  /** Contacto vinculado a la postulación con el que ocurrió el evento. */
  contactId: string | null;
  notes: string | null;
  gmailMessageId: string | null;
  createdAt: string;
}

export interface AddEventResult {
  event: ApplicationEvent;
  application: Application;
  /** `true` si el `gmailMessageId` ya existía y no se creó un evento nuevo. */
  duplicate: boolean;
}

export interface CreateApplicationRequest {
  vacancyId: string;
  cvId?: string | null;
  /** ISO 8601; por defecto, ahora. */
  appliedAt?: string;
  channel?: string | null;
  source?: EventSource;
  notes?: string | null;
}

export interface AddEventRequest {
  type: ApplicationEventType;
  /** ISO 8601; por defecto, ahora. */
  occurredAt?: string;
  channel?: string | null;
  source: EventSource;
  contactId?: string | null;
  notes?: string | null;
  gmailMessageId?: string | null;
}

export interface ApplicationTimeline {
  application: Application;
  events: ApplicationEvent[];
  contacts: ApplicationContact[];
}
