/** Estados de `outbound_emails`; #19 solo crea y edita borradores, #21 los envía. */
export const EMAIL_STATUSES = ["draft", "sending", "sent", "failed"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Borrador del correo de postulación redactado desde un CV (#19). */
export interface EmailDraft {
  id: string;
  cvId: string;
  /** `null` si falta el destinatario: no se inventa (C7). */
  to: string | null;
  subject: string;
  body: string;
  language: "es" | "en";
  status: EmailStatus;
  /** Fecha en que Gmail aceptó el envío (#21); `null` mientras no salga. */
  sentAt: string | null;
  /** Postulación creada al enviar (evento `applied` por `email`). */
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editables del borrador; `to` vacío lo deja sin destinatario. */
export interface EmailDraftChanges {
  to: string;
  subject: string;
  body: string;
}

/** Enviar exige confirmar de forma explícita tras ver asunto, cuerpo y PDF (C10). */
export interface EmailSendRequest {
  confirmed: true;
}

/** Respuesta humana a un envío ambiguo: ¿llegó el correo? (C4). */
export interface EmailResolveRequest {
  sent: boolean;
}
