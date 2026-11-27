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
  createdAt: string;
  updatedAt: string;
}

/** Campos editables del borrador; `to` vacío lo deja sin destinatario. */
export interface EmailDraftChanges {
  to: string;
  subject: string;
  body: string;
}
