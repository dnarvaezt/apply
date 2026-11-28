import type {
  EmailDraft,
  EmailDraftChanges,
  EmailResolveRequest,
  EmailSendRequest,
} from "@apply/shared";
import { json, request } from "./http.ts";

const draftUrl = (id: string) => `/email-drafts/${encodeURIComponent(id)}`;
const forCvUrl = (cvId: string) => `/cvs/${encodeURIComponent(cvId)}/email-draft`;

export const emailDraftsApi = {
  /** `null` si el CV aún no tiene borrador. */
  forCv: (cvId: string) => request<EmailDraft | null>(forCvUrl(cvId)),
  /** Sin `to`: el servidor toma el email publicado en la vacante. */
  generate: (cvId: string) =>
    request<EmailDraft>(forCvUrl(cvId), { method: "POST", body: json({}) }),
  save: (id: string, changes: EmailDraftChanges) =>
    request<EmailDraft>(draftUrl(id), { method: "PUT", body: json(changes) }),
  /** Solo tras la vista previa: el servidor exige `confirmed: true`. 202 = sin confirmar si salió. */
  send: (id: string) => {
    const confirmation: EmailSendRequest = { confirmed: true };
    return request<EmailDraft>(`${draftUrl(id)}/send`, {
      method: "POST",
      body: json(confirmation),
    });
  },
  /** Cierra un envío en `sending`: el usuario revisó Gmail y dice si salió. */
  resolve: (id: string, sent: boolean) => {
    const answer: EmailResolveRequest = { sent };
    return request<EmailDraft>(`${draftUrl(id)}/resolve`, { method: "POST", body: json(answer) });
  },
};
