import type {
  ApplicationContact,
  Contact,
  ContactInput,
  NewApplicationContactRequest,
} from "@apply/shared";
import { json, request } from "./http.ts";

export const contactsApi = {
  /** Crea el contacto y lo vincula a la vacante (#80). */
  add: (vacancyId: string, req: NewApplicationContactRequest) =>
    request<ApplicationContact>(`/vacancies/${vacancyId}/contacts`, {
      method: "POST",
      body: json(req),
    }),
  update: (id: string, input: ContactInput) =>
    request<Contact>(`/contacts/${encodeURIComponent(id)}`, { method: "PUT", body: json(input) }),
  markProcessStart: (vacancyId: string, contactId: string, isProcessStart: boolean) =>
    request<ApplicationContact>(`/vacancies/${vacancyId}/contacts/${contactId}`, {
      method: "PATCH",
      body: json({ isProcessStart }),
    }),
};
