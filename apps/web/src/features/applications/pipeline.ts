import type {
  Application,
  ApplicationEvent,
  ApplicationEventType,
  ApplicationStatus,
  CvMeta,
  EventSource,
  Vacancy,
} from "@apply/shared";

export const EVENT_LABEL: Record<ApplicationEventType, string> = {
  applied: "Postulada",
  contacted: "Contactada",
  interview: "Entrevista",
  offer: "Oferta",
  offer_accepted: "Oferta aceptada",
  offer_declined: "Oferta declinada",
  rejected: "Rechazada",
  withdrawn: "Retirada",
  closed: "Cerrada sin resultado",
  reopened: "Reabierta",
};

export const STATUS_LABEL: Record<ApplicationStatus, string> = EVENT_LABEL;

export const SOURCE_LABEL: Record<EventSource, string> = { auto: "automático", manual: "manual" };

export type StateFilter = "all" | "active" | "closed";

export interface PipelineFilter {
  status: ApplicationStatus | "all";
  state: StateFilter;
}

const STATE_MATCH: Record<StateFilter, (a: Application) => boolean> = {
  all: () => true,
  active: (a) => a.active,
  closed: (a) => !a.active,
};

export function matchesFilter(a: Application, filter: PipelineFilter): boolean {
  return (filter.status === "all" || a.status === filter.status) && STATE_MATCH[filter.state](a);
}

/** Eventos por fecha en que ocurrieron; a igual fecha, en el orden en que se registraron. */
export function chronological(events: ApplicationEvent[]): ApplicationEvent[] {
  return [...events].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt),
  );
}

export interface PipelineRow {
  application: Application;
  vacancy: string;
  company: string;
}

/** Une cada postulación con su vacante; si la vacante ya no existe, lo dice en la fila. */
export function toPipelineRows(
  applications: Application[],
  vacancies: Pick<Vacancy, "id" | "title" | "company">[],
): PipelineRow[] {
  const byId = new Map(vacancies.map((v) => [v.id, v]));
  return applications.map((application) => {
    const v = byId.get(application.vacancyId);
    return { application, vacancy: v?.title ?? "Vacante eliminada", company: v?.company ?? "—" };
  });
}

/** CVs generados para la vacante elegida: los únicos que tiene sentido adjuntar. */
export function cvsForVacancy<T extends Pick<CvMeta, "vacancyId">>(
  cvs: T[],
  vacancyId: string,
): T[] {
  return vacancyId ? cvs.filter((c) => c.vacancyId === vacancyId) : [];
}
