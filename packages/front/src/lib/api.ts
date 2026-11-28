import type { IndexStatus, ProfileFile, ProfileOrder } from "@apply/shared";
import { applicationsApi } from "./api/applications.ts";
import { contactsApi } from "./api/contacts.ts";
import { cvsApi } from "./api/cvs.ts";
import { emailDraftsApi } from "./api/email-drafts.ts";
import { gmailApi } from "./api/gmail.ts";
import { json, request } from "./api/http.ts";
import { metricsApi } from "./api/metrics.ts";
import { vacanciesApi } from "./api/vacancies.ts";

export type { GenerateHandlers } from "./api/cvs.ts";
export { generateCv } from "./api/cvs.ts";

/** Cliente de la API: cada entidad vive en su archivo bajo `api/`; aquí solo se compone. */
export const api = {
  profile: {
    list: () => request<ProfileFile[]>("/profile"),
    save: (name: string, content: string) =>
      request<{ name: string }>(`/profile/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: json({ content }),
      }),
    remove: (name: string) => request(`/profile/${encodeURIComponent(name)}`, { method: "DELETE" }),
    rename: (from: string, to: string) =>
      request<{ name: string }>(`/profile/${encodeURIComponent(from)}/rename`, {
        method: "POST",
        body: json({ to }),
      }),
    order: () => request<ProfileOrder>("/profile-order"),
    setOrder: (order: ProfileOrder) =>
      request<ProfileOrder>("/profile-order", { method: "PUT", body: json(order) }),
  },
  index: {
    status: () => request<IndexStatus>("/index/status"),
    rebuild: () => request<IndexStatus>("/index/rebuild", { method: "POST" }),
  },
  vacancies: vacanciesApi,
  cvs: cvsApi,
  applications: applicationsApi,
  contacts: contactsApi,
  emailDrafts: emailDraftsApi,
  metrics: metricsApi,
  gmail: gmailApi,
};

/** Descarga un archivo desde una URL o un Blob. */
export async function download(source: string | Blob, fallbackName: string): Promise<void> {
  let blob: Blob;
  let filename = fallbackName;
  if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Error ${res.status}`);
    }
    filename = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? filename;
    blob = await res.blob();
  } else {
    blob = source;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
