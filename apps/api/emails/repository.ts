import { outboundEmails } from "@apply/db";
import type { EmailDraft, EmailStatus, Vacancy } from "@apply/shared";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createApplicationsRepository } from "../applications/repository.ts";
import type { Db } from "../db.ts";
import { formatId, parseId } from "../ids.ts";

/** El correo ya salió del estado `draft` (#21): la ruta responde 409. */
export class NotDraftError extends Error {}

export interface NewDraft {
  cvId: string;
  to: string | null;
  subject: string;
  body: string;
  language: Vacancy["language"];
}

type Row = typeof outboundEmails.$inferSelect;

function toLanguage(value: string): EmailDraft["language"] {
  if (value === "es" || value === "en") return value;
  throw new Error(`Idioma de correo desconocido: ${value}`);
}

function toDraft(row: Row): EmailDraft {
  if (row.cvId === null) throw new Error("Correo sin CV de origen");
  return {
    id: formatId(row.id),
    cvId: formatId(row.cvId),
    to: row.toAddress,
    subject: row.subject,
    body: row.body,
    language: toLanguage(row.language),
    status: row.status,
    sentAt: row.sentAt?.toISOString() ?? null,
    applicationId: row.applicationId === null ? null : formatId(row.applicationId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Estados en que el usuario puede editar el correo: nunca mientras se envía ni ya enviado. */
const EDITABLE: EmailStatus[] = ["draft", "failed"];

/** Borradores sin postulación: los que #19 crea y puede reemplazar. */
const pendingDraftsOf = (cvId: number) =>
  and(
    eq(outboundEmails.cvId, cvId),
    eq(outboundEmails.status, "draft"),
    isNull(outboundEmails.applicationId),
  );

/** Lo que el envío (#21) necesita además del borrador visible. */
export interface OutboundEmail {
  draft: EmailDraft;
  /** Message-ID propio de un intento anterior; `null` si nunca se intentó enviar. */
  messageIdHeader: string | null;
}

export interface SendingAttempt {
  messageIdHeader: string;
  pdf: Buffer;
  pdfSha256: string;
}

export interface SentMessage {
  /** `null` cuando el usuario confirmó a mano que salió y Gmail no dio ids (C4). */
  gmailId: string | null;
  threadId: string | null;
  sentAt: Date;
  /** Vacante del CV: la postulación se crea para ella. */
  vacancyId: string;
}

export function createEmailDraftsRepository(db: Db) {
  /** Cambia el estado solo si el correo sigue en uno de `from`; `null` si otro proceso ganó. */
  async function transition(
    id: string,
    from: EmailStatus[],
    changes: Partial<typeof outboundEmails.$inferInsert>,
  ): Promise<EmailDraft | null> {
    const numeric = parseId(id);
    if (numeric === null) return null;
    const [row] = await db
      .update(outboundEmails)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(outboundEmails.id, numeric), inArray(outboundEmails.status, from)))
      .returning();
    return row ? toDraft(row) : null;
  }

  return {
    async findOutbound(id: string): Promise<OutboundEmail | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const [row] = await db.select().from(outboundEmails).where(eq(outboundEmails.id, numeric));
      return row ? { draft: toDraft(row), messageIdHeader: row.messageIdHeader } : null;
    },

    /** REQ-004: Message-ID, PDF y `sending` quedan guardados antes de llamar a Gmail. */
    markSending: (id: string, from: EmailStatus, attempt: SendingAttempt) =>
      transition(id, [from], { status: "sending", ...attempt }),

    /** Gmail no se llegó a llamar: el correo vuelve al estado que tenía. */
    revertSending: (id: string, to: EmailStatus) => transition(id, ["sending"], { status: to }),

    /** Gmail rechazó el envío, o el usuario confirmó que no salió. */
    markFailed: (id: string) => transition(id, ["sending"], { status: "failed" }),

    /**
     * Guarda los ids y la fecha de envío y crea la postulación con su evento `applied` por
     * `email` en la misma transacción (REQ-004, REQ-008). `null` si ya no estaba pendiente.
     */
    async markSent(id: string, sent: SentMessage): Promise<EmailDraft | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(outboundEmails)
          .set({
            status: "sent",
            gmailId: sent.gmailId,
            threadId: sent.threadId,
            sentAt: sent.sentAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(outboundEmails.id, numeric),
              inArray(outboundEmails.status, ["sending", "failed"]),
            ),
          )
          .returning();
        if (!row) return null;
        const application = await createApplicationsRepository(tx).create({
          vacancyId: sent.vacancyId,
          cvId: row.cvId === null ? null : formatId(row.cvId),
          appliedAt: sent.sentAt.toISOString(),
          channel: "email",
          source: "auto",
          gmailMessageId: sent.gmailId,
        });
        if (!application) throw new Error("La vacante del CV ya no existe");
        const [linked] = await tx
          .update(outboundEmails)
          .set({ applicationId: Number(application.id) })
          .where(eq(outboundEmails.id, numeric))
          .returning();
        if (!linked) throw new Error("No se pudo enlazar la postulación al correo");
        return toDraft(linked);
      });
    },

    /** Guarda el borrador recién generado y reemplaza el que el CV tuviera pendiente. */
    async replaceForCv(input: NewDraft): Promise<EmailDraft> {
      const cvId = parseId(input.cvId);
      if (cvId === null) throw new Error("CV no encontrado");
      return db.transaction(async (tx) => {
        await tx.delete(outboundEmails).where(pendingDraftsOf(cvId));
        const [row] = await tx
          .insert(outboundEmails)
          .values({
            cvId,
            toAddress: input.to,
            subject: input.subject,
            body: input.body,
            language: input.language,
          })
          .returning();
        if (!row) throw new Error("No se pudo guardar el borrador");
        return toDraft(row);
      });
    },

    /** El correo más reciente redactado desde el CV; `null` si no hay. */
    async latestForCv(cvId: string): Promise<EmailDraft | null> {
      const numeric = parseId(cvId);
      if (numeric === null) return null;
      const [row] = await db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.cvId, numeric))
        .orderBy(desc(outboundEmails.id))
        .limit(1);
      return row ? toDraft(row) : null;
    },

    /** `null` si no existe; `NotDraftError` si se está enviando o ya salió. `to` `null` = sin destinatario. */
    async update(
      id: string,
      changes: { to: string | null; subject: string; body: string },
    ): Promise<EmailDraft | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      const [row] = await db
        .update(outboundEmails)
        .set({
          toAddress: changes.to,
          subject: changes.subject,
          body: changes.body,
          // Corregir un envío fallido lo devuelve a borrador; el Message-ID se conserva.
          status: "draft",
          updatedAt: new Date(),
        })
        .where(and(eq(outboundEmails.id, numeric), inArray(outboundEmails.status, EDITABLE)))
        .returning();
      if (row) return toDraft(row);
      const [existing] = await db
        .select({ id: outboundEmails.id })
        .from(outboundEmails)
        .where(eq(outboundEmails.id, numeric));
      if (existing) throw new NotDraftError("El correo ya no es un borrador");
      return null;
    },
  };
}

export type EmailDraftsRepository = ReturnType<typeof createEmailDraftsRepository>;
