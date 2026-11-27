import { createHash } from "node:crypto";
import type { CvDoc, EmailDraft } from "@apply/shared";
import { z } from "zod";
import {
  type GmailConnection,
  type GmailMessageRef,
  GmailUnavailableError,
} from "../gmail/connection.ts";
import { cvPdfFilename } from "../storage.ts";
import { buildMime, newMessageId } from "./mime.ts";
import type { EmailDraftsRepository, OutboundEmail } from "./repository.ts";

/** La parte de la conexión Gmail que usa el envío. */
export type GmailSender = Pick<GmailConnection, "send" | "findSent">;

export interface EmailSenderDeps {
  repo: EmailDraftsRepository;
  /** `null` sin credenciales de Google: no se puede enviar (REQ-007 de #11). */
  gmail: GmailSender | null;
  getCv: (id: string) => Promise<CvDoc | null>;
  /** Frontera externa: Chrome del host genera el PDF (`pdf.ts`). */
  renderPdf: (markdown: string, title: string) => Promise<Uint8Array>;
}

/** Resultado de un envío; la ruta lo traduce a HTTP. */
export type SendOutcome =
  /** Estado final ya guardado: enviado, o `failed` si el usuario confirmó que no salió. */
  | { kind: "ok"; draft: EmailDraft }
  /** No se sabe si salió: no se reenvía solo, se pide confirmación humana (C4). */
  | { kind: "pending"; draft: EmailDraft }
  | { kind: "not_found" }
  | { kind: "invalid"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "rejected"; message: string };

const NOT_CONFIGURED = "Gmail no está configurado: define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET";
const BUSY = "El correo cambió de estado mientras se enviaba; recarga y revisa su estado";

/**
 * Gmail respondió con un 4xx: rechazó el mensaje y no lo envió. Un 5xx, un timeout o una
 * conexión caída no dicen si salió: el envío queda ambiguo.
 */
const rejectedByGmail = z.object({
  response: z.object({ status: z.number().int().min(400).max(499) }),
});

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createEmailSender({ repo, gmail, getCv, renderPdf }: EmailSenderDeps) {
  async function vacancyOf(draft: EmailDraft): Promise<string> {
    const cv = await getCv(draft.cvId);
    if (!cv?.vacancyId) throw new Error("El CV del correo no tiene vacante");
    return cv.vacancyId;
  }

  async function finish(draft: EmailDraft, ref: GmailMessageRef | null): Promise<SendOutcome> {
    const sent = await repo.markSent(draft.id, {
      gmailId: ref?.id ?? null,
      threadId: ref?.threadId ?? null,
      sentAt: new Date(),
      vacancyId: await vacancyOf(draft),
    });
    return sent ? { kind: "ok", draft: sent } : { kind: "conflict", message: BUSY };
  }

  /** REQ-005: un intento previo se busca por su Message-ID antes de volver a enviar. */
  async function reconcile(
    gmail: GmailSender,
    { draft, messageIdHeader }: OutboundEmail,
  ): Promise<SendOutcome | null> {
    const found = messageIdHeader === null ? null : await gmail.findSent(messageIdHeader);
    if (found) return finish(draft, found);
    return draft.status === "sending" ? { kind: "pending", draft } : null;
  }

  async function attempt(
    gmail: GmailSender,
    { draft, messageIdHeader }: OutboundEmail,
    to: string,
  ): Promise<SendOutcome> {
    const cv = await getCv(draft.cvId);
    if (!cv) return { kind: "not_found" };
    const pdf = Buffer.from(await renderPdf(cv.markdown, cv.title));
    const messageId = messageIdHeader ?? newMessageId();
    const sending = await repo.markSending(draft.id, draft.status, {
      messageIdHeader: messageId,
      pdf,
      pdfSha256: sha256(pdf),
    });
    if (!sending) return { kind: "conflict", message: BUSY };

    const raw = buildMime({
      to,
      subject: draft.subject,
      body: draft.body,
      pdf,
      filename: cvPdfFilename(cv.markdown, cv.title),
      messageId,
      date: new Date(),
    });
    try {
      return await finish(sending, await gmail.send(raw));
    } catch (e) {
      return handleSendError(e, draft);
    }
  }

  async function handleSendError(e: unknown, before: EmailDraft): Promise<SendOutcome> {
    // REQ-009: solo el mensaje del error; nunca el cuerpo del correo ni tokens.
    console.error(`Gmail: el envío del correo ${before.id} falló:`, errorText(e));
    if (e instanceof GmailUnavailableError) {
      await repo.revertSending(before.id, before.status);
      return { kind: "unavailable", message: e.message };
    }
    if (rejectedByGmail.safeParse(e).success) {
      await repo.markFailed(before.id);
      return { kind: "rejected", message: `Gmail rechazó el envío: ${errorText(e)}` };
    }
    const pending = await repo.findOutbound(before.id);
    if (!pending) return { kind: "not_found" };
    return { kind: "pending", draft: pending.draft };
  }

  /** Envía el borrador con el CV en PDF; nunca dos veces el mismo correo (C4, D8). */
  async function send(id: string): Promise<SendOutcome> {
    const outbound = await repo.findOutbound(id);
    if (!outbound) return { kind: "not_found" };
    const { draft } = outbound;
    if (draft.status === "sent") return { kind: "ok", draft };
    if (!draft.to) {
      return {
        kind: "invalid",
        message: "Falta el destinatario: escríbelo o registra la postulación a mano",
      };
    }
    if (!gmail) return { kind: "unavailable", message: NOT_CONFIGURED };
    try {
      const reconciled = await reconcile(gmail, outbound);
      return reconciled ?? (await attempt(gmail, outbound, draft.to));
    } catch (e) {
      if (e instanceof GmailUnavailableError) return { kind: "unavailable", message: e.message };
      throw e;
    }
  }

  /** Respuesta humana a un envío ambiguo: `sent` lo cierra con la postulación (C4). */
  async function resolve(id: string, sent: boolean): Promise<SendOutcome> {
    const outbound = await repo.findOutbound(id);
    if (!outbound) return { kind: "not_found" };
    const { draft } = outbound;
    if (draft.status !== "sending") {
      return { kind: "conflict", message: "Solo se confirma un envío pendiente de verificar" };
    }
    if (sent) return finish(draft, null);
    const failed = await repo.markFailed(id);
    return failed ? { kind: "ok", draft: failed } : { kind: "conflict", message: BUSY };
  }

  return { send, resolve };
}

export type EmailSender = ReturnType<typeof createEmailSender>;
