import type { ApplicationEventType, ContactOrigin, TrackingMetrics } from "@apply/shared";
import { and, asc, count, countDistinct, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { applicationContacts, applicationEvents, applications, channels, vacancies } from "#db";
import { CLASSIFIED, type ClassifiedDefinition } from "../applications/classified.ts";
import { activeStatusesFrom } from "../applications/status.ts";
import type { Db } from "../db.ts";

/** Eventos que cuentan como contacto de la empresa (REQ-002, REQ-005). */
const CONTACT_EVENT_TYPES: ApplicationEventType[] = ["contacted", "interview", "offer"];

export function createMetricsRepository(db: Db) {
  async function appliedCount(): Promise<number> {
    const [row] = await db
      .select({ value: countDistinct(applicationEvents.applicationId) })
      .from(applicationEvents)
      .where(eq(applicationEvents.type, "applied"));
    return row?.value ?? 0;
  }

  async function companiesContacted(): Promise<number> {
    const [row] = await db
      .select({ value: countDistinct(vacancies.companyId) })
      .from(applicationEvents)
      .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
      .innerJoin(vacancies, eq(vacancies.id, applications.vacancyId))
      .where(inArray(applicationEvents.type, CONTACT_EVENT_TYPES));
    return row?.value ?? 0;
  }

  async function classified(definition: ClassifiedDefinition): Promise<number> {
    const reached = db
      .select({ one: sql`1` })
      .from(applicationEvents)
      .where(
        and(
          eq(applicationEvents.applicationId, applications.id),
          inArray(applicationEvents.type, [...definition.eventTypes]),
        ),
      );
    const startedByContact = db
      .select({ one: sql`1` })
      .from(applicationContacts)
      .where(
        and(
          eq(applicationContacts.applicationId, applications.id),
          eq(applicationContacts.isProcessStart, true),
        ),
      );
    const [row] = await db
      .select({ value: count() })
      .from(applications)
      .where(
        or(exists(reached), definition.processStartContact ? exists(startedByContact) : undefined),
      );
    return row?.value ?? 0;
  }

  async function contactOrigin(): Promise<ContactOrigin[]> {
    const firstContact = db
      .selectDistinctOn([applicationEvents.applicationId], {
        channelId: applicationEvents.channelId,
      })
      .from(applicationEvents)
      .where(inArray(applicationEvents.type, CONTACT_EVENT_TYPES))
      .orderBy(applicationEvents.applicationId, applicationEvents.occurredAt, applicationEvents.id)
      .as("first_contact");
    return db
      .select({ channel: channels.slug, count: count() })
      .from(firstContact)
      .leftJoin(channels, eq(channels.id, firstContact.channelId))
      .groupBy(channels.slug)
      .orderBy(desc(count()), asc(channels.slug));
  }

  async function byStatus() {
    const active = inArray(applications.status, activeStatusesFrom("applied"));
    const advanced = inArray(applications.status, activeStatusesFrom("contacted"));
    const [row] = await db
      .select({
        open: sql<number>`count(*) filter (where ${active})`.mapWith(Number),
        closed: sql<number>`count(*) filter (where not ${active})`.mapWith(Number),
        activeProcesses: sql<number>`count(*) filter (where ${advanced})`.mapWith(Number),
      })
      .from(applications);
    return row ?? { open: 0, closed: 0, activeProcesses: 0 };
  }

  return {
    /** Métricas de seguimiento desde la base, sin contadores aparte (REQ-007). */
    async tracking(definition: ClassifiedDefinition = CLASSIFIED): Promise<TrackingMetrics> {
      const [applied, companies, classifiedCount, origin, status] = await Promise.all([
        appliedCount(),
        companiesContacted(),
        classified(definition),
        contactOrigin(),
        byStatus(),
      ]);
      return {
        applications: applied,
        companiesContacted: companies,
        activeProcesses: status.activeProcesses,
        classified: classifiedCount,
        contactOrigin: origin,
        open: status.open,
        closed: status.closed,
      };
    },
  };
}

export type MetricsRepository = ReturnType<typeof createMetricsRepository>;
