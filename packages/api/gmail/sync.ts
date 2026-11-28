import type { GmailSyncResult, GmailSyncStatus } from "@apply/shared";
import type { ApplicationsRepository } from "../applications/repository.ts";
import { type GmailConnection, type GmailReader, GmailUnavailableError } from "./connection.ts";
import { contactQuery, type GmailMessageMeta, isIncomingReply, senderAddress } from "./replies.ts";
import type { SentApplicationEmail, SyncRepository } from "./sync-repository.ts";

/** Ventana de la detección: una respuesta más tardía se registra a mano (C7). */
export const SYNC_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60_000;

export interface ReplySyncDeps {
  /** `null` sin credenciales de Google: no hay detección (REQ-006). */
  gmail: Pick<GmailConnection, "read"> | null;
  repo: SyncRepository;
  applications: Pick<ApplicationsRepository, "addEvent">;
  intervalMinutes: number;
  now?: () => Date;
}

interface Detected {
  message: GmailMessageMeta;
  contactId: string | null;
}

/**
 * Detección de respuestas por polling (D8): el hilo de cada correo enviado y los correos de sus
 * contactos con email conocido. Cada mensaje nuevo es un evento `contacted` automático.
 */
export function createReplySync({
  gmail,
  repo,
  applications,
  intervalMinutes,
  now = () => new Date(),
}: ReplySyncDeps) {
  let running: Promise<GmailSyncResult> | null = null;

  /** Respuestas de un correo, sin repetir el mismo mensaje del hilo y de la búsqueda. */
  async function repliesTo(reader: GmailReader, email: SentApplicationEmail) {
    const byEmail = new Map(email.contacts.map((c) => [c.email.toLowerCase(), c.id]));
    const found = new Map<string, Detected>();
    const keep = (message: GmailMessageMeta, contactId: string | null) => {
      if (found.has(message.id)) return;
      if (!isIncomingReply(message, { account: reader.account, sentAt: email.sentAt })) return;
      found.set(message.id, {
        message,
        contactId: contactId ?? byEmail.get(senderAddress(message.from)) ?? null,
      });
    };
    if (email.threadId) {
      for (const message of await reader.thread(email.threadId)) keep(message, null);
    }
    for (const contact of email.contacts) {
      for (const message of await reader.search(contactQuery(contact.email, email.sentAt))) {
        keep(message, contact.id);
      }
    }
    return [...found.values()];
  }

  /** Registra cada respuesta; un mensaje ya registrado no cuenta (REQ-003). */
  async function record(applicationId: string, replies: Detected[]): Promise<number> {
    let recorded = 0;
    for (const { message, contactId } of replies) {
      const result = await applications.addEvent(applicationId, {
        type: "contacted",
        occurredAt: message.date.toISOString(),
        channel: "email",
        source: "auto",
        contactId,
        gmailMessageId: message.id,
      });
      if (result && !result.duplicate) recorded += 1;
    }
    return recorded;
  }

  async function sync(reader: GmailReader): Promise<GmailSyncResult> {
    const startedAt = now();
    const since = new Date(startedAt.getTime() - SYNC_WINDOW_DAYS * DAY_MS);
    let recorded = 0;
    for (const email of await repo.sentSince(since)) {
      recorded += await record(email.applicationId, await repliesTo(reader, email));
    }
    const finishedAt = now();
    await repo.saveSync(reader.account ?? "me", finishedAt);
    return { state: "synced", recorded, lastSyncedAt: finishedAt.toISOString() };
  }

  async function runOnce(): Promise<GmailSyncResult> {
    if (!gmail) return { state: "skipped", reason: "not_configured" };
    try {
      return await gmail.read(sync);
    } catch (e) {
      if (e instanceof GmailUnavailableError) return { state: "skipped", reason: e.state };
      throw e;
    }
  }

  return {
    /** Una sola corrida a la vez: una llamada durante otra recibe el mismo resultado. */
    run(): Promise<GmailSyncResult> {
      running ??= runOnce().finally(() => {
        running = null;
      });
      return running;
    },

    async status(): Promise<GmailSyncStatus> {
      const at = await repo.lastSyncedAt();
      return { lastSyncedAt: at?.toISOString() ?? null, intervalMinutes };
    },
  };
}

export type ReplySync = ReturnType<typeof createReplySync>;
