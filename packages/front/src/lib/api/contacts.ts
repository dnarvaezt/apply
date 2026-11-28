import type {
  ApplicationContact,
  Contact,
  ContactInput,
  NewApplicationContactRequest,
} from "@apply/shared";
import { json, request } from "./http.ts";

export const contactsApi = {
  /** Crea el contacto y lo vincula a la postulación. */
  add: (applicationId: string, req: NewApplicationContactRequest) =>
    request<ApplicationContact>(`/applications/${applicationId}/contacts`, {
      method: "POST",
      body: json(req),
    }),
  update: (id: string, input: ContactInput) =>
    request<Contact>(`/contacts/${encodeURIComponent(id)}`, { method: "PUT", body: json(input) }),
  markProcessStart: (applicationId: string, contactId: string, isProcessStart: boolean) =>
    request<ApplicationContact>(`/applications/${applicationId}/contacts/${contactId}`, {
      method: "PATCH",
      body: json({ isProcessStart }),
    }),
};
