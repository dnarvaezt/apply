import { and, desc, eq, gte, inArray, isNotNull, max } from "drizzle-orm";
import { applicationContacts, contacts, gmailSyncState, outboundEmails } from "#db";
import type { Db } from "../db.ts";
import { formatId } from "../ids.ts";

/** Contacto con email conocido de la postulación (#20). */
export interface KnownContact {
  id: string;
  email: string;
}

/** Correo enviado cuyo hilo y contactos revisa la detección (#22). */
export interface SentApplicationEmail {
  applicationId: string;
  threadId: string | null;
  sentAt: Date;
  contacts: KnownContact[];
}

export function createSyncRepository(db: Db) {
  async function contactsOf(applicationIds: number[]): Promise<Map<number, KnownContact[]>> {
    const byApplication = new Map<number, KnownContact[]>();
    if (!applicationIds.length) return byApplication;
    const rows = await db
      .select({
        applicationId: applicationContacts.applicationId,
        id: contacts.id,
        email: contacts.email,
      })
      .from(applicationContacts)
      .innerJoin(contacts, eq(contacts.id, applicationContacts.contactId))
      .where(
        and(inArray(applicationContacts.applicationId, applicationIds), isNotNull(contacts.email)),
      );
    for (const row of rows) {
      if (!row.email) continue;
      const list = byApplication.get(row.applicationId) ?? [];
      list.push({ id: formatId(row.id), email: row.email });
      byApplication.set(row.applicationId, list);
    }
    return byApplication;
  }

  return {
    /** Correos enviados desde `since`, los más recientes primero, con sus contactos con email. */
    async sentSince(since: Date): Promise<SentApplicationEmail[]> {
      const rows = await db
        .select({
          applicationId: outboundEmails.applicationId,
          threadId: outboundEmails.threadId,
          sentAt: outboundEmails.sentAt,
        })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.status, "sent"),
            isNotNull(outboundEmails.applicationId),
            gte(outboundEmails.sentAt, since),
          ),
        )
        .orderBy(desc(outboundEmails.sentAt));
      const sent = rows.flatMap(({ applicationId, threadId, sentAt }) =>
        applicationId !== null && sentAt !== null ? [{ applicationId, threadId, sentAt }] : [],
      );
      const known = await contactsOf(sent.map((s) => s.applicationId));
      return sent.map((s) => ({
        applicationId: formatId(s.applicationId),
        threadId: s.threadId,
        sentAt: s.sentAt,
        contacts: known.get(s.applicationId) ?? [],
      }));
    },

    /** Guarda el avance de la cuenta: una fila por cuenta, sin tokens (REQ-005, D10). */
    async saveSync(account: string, at: Date): Promise<void> {
      await db
        .insert(gmailSyncState)
        .values({ account, lastSyncedAt: at, updatedAt: at })
        .onConflictDoUpdate({
          target: gmailSyncState.account,
          set: { lastSyncedAt: at, updatedAt: at },
        });
    },

    /** Última sincronización de cualquier cuenta; `null` si nunca corrió. */
    async lastSyncedAt(): Promise<Date | null> {
      const [row] = await db.select({ at: max(gmailSyncState.lastSyncedAt) }).from(gmailSyncState);
      return row?.at ?? null;
    },
  };
}

export type SyncRepository = ReturnType<typeof createSyncRepository>;
