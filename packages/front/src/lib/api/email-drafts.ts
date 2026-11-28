import type { EmailDraft } from "@apply/shared";
import { json, request } from "./http.ts";

const forCvUrl = (cvId: string) => `/cvs/${encodeURIComponent(cvId)}/email-draft`;

export const emailDraftsApi = {
  /** `null` si el CV aún no tiene borrador. */
  forCv: (cvId: string) => request<EmailDraft | null>(forCvUrl(cvId)),
  /** Sin `to`: el servidor toma el email publicado en la vacante. */
  generate: (cvId: string) =>
    request<EmailDraft>(forCvUrl(cvId), { method: "POST", body: json({}) }),
};
