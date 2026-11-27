import type { EmailDraft, EmailDraftChanges } from "@apply/shared";
import { json, request } from "./http.ts";

const forCvUrl = (cvId: string) => `/cvs/${encodeURIComponent(cvId)}/email-draft`;

export const emailDraftsApi = {
  /** `null` si el CV aún no tiene borrador. */
  forCv: (cvId: string) => request<EmailDraft | null>(forCvUrl(cvId)),
  /** Sin `to`: el servidor toma el email publicado en la vacante. */
  generate: (cvId: string) =>
    request<EmailDraft>(forCvUrl(cvId), { method: "POST", body: json({}) }),
  save: (id: string, changes: EmailDraftChanges) =>
    request<EmailDraft>(`/email-drafts/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: json(changes),
    }),
};
