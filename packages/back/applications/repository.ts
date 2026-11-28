import type {
  AddEventResult,
  Application,
  ApplicationEvent,
  ApplicationEventType,
  ApplicationStatus,
  ApplicationTimeline,
  Channel,
  EventSource,
  VacancyStatus,
} from "@apply/shared";
import { asc, desc, eq } from "drizzle-orm";
import { applicationEvents, applications, channels, cvs, vacancies } from "#db";
import { isLinked, listVacancyContacts } from "../contacts/repository.ts";
import type { Executor } from "../db.ts";
import { formatId, parseId } from "../ids.ts";
import { advanceVacancy } from "../process/repository.ts";
import { canRecord, isActive, isClassifying, isTerminal, next } from "./status.ts";

/**
 * Entrada inválida del cliente (canal o CV inexistente, contacto ajeno, `reopened` automático):
 * la ruta responde 400.
 */
export class InvalidEventError extends Error {}

export interface NewApplication {
  vacancyId: string;
  cvId?: string | null;
  appliedAt?: string;
  channel?: string | null;
  source: EventSource;
  notes?: string | null;
  /** Mensaje de Gmail que originó la postulación (envío automático, #21). */
  gmailMessageId?: string | null;
}

export interface NewEvent {
  type: ApplicationEventType;
  occurredAt?: string;
  channel?: string | null;
  source: EventSource;
  contactId?: string | null;
  notes?: string | null;
  gmailMessageId?: string | null;
}

type AppRow = typeof applications.$inferSelect;

function toApplication(row: AppRow): Application {
  return {
    id: formatId(row.id),
    vacancyId: formatId(row.vacancyId),
    cvId: row.cvId === null ? null : formatId(row.cvId),
    status: row.status,
    active: isActive(row.status),
    classifiedAt: row.classifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const eventColumns = {
  id: applicationEvents.id,
  applicationId: applicationEvents.applicationId,
  type: applicationEvents.type,
  occurredAt: applicationEvents.occurredAt,
  channel: channels.slug,
  source: applicationEvents.source,
  contactId: applicationEvents.contactId,
  notes: applicationEvents.notes,
  gmailMessageId: applicationEvents.gmailMessageId,
  createdAt: applicationEvents.createdAt,
};

function toEvent(row: {
  id: number;
  applicationId: number;
  type: ApplicationEventType;
  occurredAt: Date;
  channel: string | null;
  source: EventSource;
  contactId: number | null;
  notes: string | null;
  gmailMessageId: string | null;
  createdAt: Date;
}): ApplicationEvent {
  return {
    ...row,
    id: formatId(row.id),
    applicationId: formatId(row.applicationId),
    contactId: row.contactId === null ? null : formatId(row.contactId),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function findEvent(tx: Executor, where: ReturnType<typeof eq>): Promise<ApplicationEvent> {
  const [row] = await tx
    .select(eventColumns)
    .from(applicationEvents)
    .leftJoin(channels, eq(channels.id, applicationEvents.channelId))
    .where(where);
  if (!row) throw new Error("Evento no encontrado");
  return toEvent(row);
}

async function channelId(tx: Executor, slug: string | null | undefined): Promise<number | null> {
  if (!slug) return null;
  const [row] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.slug, slug));
  if (!row) throw new InvalidEventError(`Canal desconocido: ${slug}`);
  return row.id;
}

/** Contacto del evento: debe estar vinculado a la vacante de la postulación (#80). */
async function eventContactId(
  tx: Executor,
  vacancyId: number,
  raw: string | null | undefined,
): Promise<number | null> {
  if (!raw) return null;
  const id = parseId(raw);
  if (id === null || !(await isLinked(tx, vacancyId, id))) {
    throw new InvalidEventError("El contacto no está vinculado a la vacante");
  }
  return id;
}

/**
 * Estado al que la app mueve la vacante (#80) cuando registra el hecho sola: el envío del
 * correo la deja Postulada y una respuesta en Gmail, En contacto.
 */
const AUTO_ADVANCE: Partial<Record<ApplicationEventType, VacancyStatus>> = {
  applied: "applied",
  contacted: "contacted",
};

/**
 * Guarda el evento (append-only) y actualiza el estado materializado en la misma transacción
 * (REQ-003). La fila de la postulación se bloquea para que dos eventos concurrentes no
 * deriven del mismo estado.
 */
async function recordEvent(
  tx: Executor,
  applicationId: number,
  input: NewEvent,
): Promise<AddEventResult | null> {
  if (!canRecord(input)) {
    throw new InvalidEventError("Un evento reopened solo se acepta con source = manual");
  }
  const [current] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for("update");
  if (!current) return null;

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const [inserted] = await tx
    .insert(applicationEvents)
    .values({
      applicationId,
      type: input.type,
      occurredAt,
      channelId: await channelId(tx, input.channel),
      source: input.source,
      contactId: await eventContactId(tx, current.vacancyId, input.contactId),
      notes: input.notes ?? null,
      gmailMessageId: input.gmailMessageId ?? null,
    })
    .onConflictDoNothing({ target: applicationEvents.gmailMessageId })
    .returning({ id: applicationEvents.id });

  if (!inserted) {
    // REQ-008: el mensaje de Gmail ya se registró; no se crea un segundo evento.
    const event = await findEvent(
      tx,
      eq(applicationEvents.gmailMessageId, input.gmailMessageId as string),
    );
    return { event, application: toApplication(current), duplicate: true };
  }

  const status: ApplicationStatus = next(current.status, input);
  const classifies =
    current.classifiedAt === null && isClassifying(input.type) && !isTerminal(current.status);
  const [updated] = await tx
    .update(applications)
    .set({
      status,
      ...(classifies ? { classifiedAt: occurredAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, applicationId))
    .returning();
  if (!updated) throw new Error("No se pudo actualizar la postulación");

  const target = AUTO_ADVANCE[input.type];
  if (input.source === "auto" && target) {
    await advanceVacancy(tx, current.vacancyId, target, {
      channel: input.channel ?? null,
      occurredAt,
    });
  }

  const event = await findEvent(tx, eq(applicationEvents.id, inserted.id));
  return { event, application: toApplication(updated), duplicate: false };
}

export function createApplicationsRepository(db: Executor) {
  return {
    /** `null` si la vacante no existe. Crea la postulación con su evento `applied` (REQ-002). */
    async create(input: NewApplication): Promise<Application | null> {
      const vid = parseId(input.vacancyId);
      if (vid === null) return null;
      const cvId = input.cvId ? parseId(input.cvId) : null;
      if (input.cvId && cvId === null) throw new InvalidEventError("CV no encontrado");

      return db.transaction(async (tx) => {
        const [vacancy] = await tx
          .select({ id: vacancies.id })
          .from(vacancies)
          .where(eq(vacancies.id, vid));
        if (!vacancy) return null;
        if (cvId !== null) {
          const [cv] = await tx.select({ id: cvs.id }).from(cvs).where(eq(cvs.id, cvId));
          if (!cv) throw new InvalidEventError("CV no encontrado");
        }

        const [row] = await tx
          .insert(applications)
          .values({ vacancyId: vid, cvId, status: "applied" })
          .returning({ id: applications.id });
        if (!row) throw new Error("No se pudo guardar la postulación");

        const result = await recordEvent(tx, row.id, {
          type: "applied",
          occurredAt: input.appliedAt,
          channel: input.channel,
          source: input.source,
          notes: input.notes,
          gmailMessageId: input.gmailMessageId,
        });
        if (!result) throw new Error("No se pudo registrar el evento applied");
        return result.application;
      });
    },

    /** `null` si la postulación no existe. */
    async addEvent(id: string, input: NewEvent): Promise<AddEventResult | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      return db.transaction((tx) => recordEvent(tx, numeric, input));
    },

    async get(id: string): Promise<Application | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const [row] = await db.select().from(applications).where(eq(applications.id, numeric));
      return row ? toApplication(row) : null;
    },

    /** Las actualizadas más recientemente primero; opcionalmente, solo las de una vacante. */
    async list(filter: { vacancyId?: string } = {}): Promise<Application[]> {
      let where: ReturnType<typeof eq> | undefined;
      if (filter.vacancyId !== undefined) {
        const vid = parseId(filter.vacancyId);
        if (vid === null) return [];
        where = eq(applications.vacancyId, vid);
      }
      const rows = await db
        .select()
        .from(applications)
        .where(where)
        .orderBy(desc(applications.updatedAt), desc(applications.id));
      return rows.map(toApplication);
    },

    /** Canales de contacto de la tabla `channels`, por nombre. */
    async channels(): Promise<Channel[]> {
      return db
        .select({ slug: channels.slug, name: channels.name })
        .from(channels)
        .orderBy(asc(channels.name));
    },

    /** Postulación, sus eventos en orden cronológico y sus contactos; `null` si no existe. */
    async timeline(id: string): Promise<ApplicationTimeline | null> {
      const application = await this.get(id);
      if (!application) return null;
      const rows = await db
        .select(eventColumns)
        .from(applicationEvents)
        .leftJoin(channels, eq(channels.id, applicationEvents.channelId))
        .where(eq(applicationEvents.applicationId, Number(application.id)))
        .orderBy(asc(applicationEvents.occurredAt), asc(applicationEvents.id));
      const contacts = await listVacancyContacts(db, Number(application.vacancyId));
      return { application, events: rows.map(toEvent), contacts };
    },
  };
}

export type ApplicationsRepository = ReturnType<typeof createApplicationsRepository>;
