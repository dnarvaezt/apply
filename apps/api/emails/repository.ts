import { outboundEmails } from "@apply/db";
import type { EmailDraft, Vacancy } from "@apply/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Borradores sin postulación: los que #19 crea y puede reemplazar. */
const pendingDraftsOf = (cvId: number) =>
  and(
    eq(outboundEmails.cvId, cvId),
    eq(outboundEmails.status, "draft"),
    isNull(outboundEmails.applicationId),
  );

export function createEmailDraftsRepository(db: Db) {
  return {
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

    /** `null` si no existe; `NotDraftError` si ya no es borrador. `to` `null` = sin destinatario. */
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
          updatedAt: new Date(),
        })
        .where(and(eq(outboundEmails.id, numeric), eq(outboundEmails.status, "draft")))
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
