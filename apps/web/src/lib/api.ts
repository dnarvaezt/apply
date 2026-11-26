import type {
  CvDoc,
  CvMeta,
  IndexStatus,
  MatchReport,
  ProfileFile,
  Vacancy,
} from "../../shared/types.ts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  profile: {
    list: () => request<ProfileFile[]>("/profile"),
    save: (name: string, content: string) =>
      request<{ name: string }>(`/profile/${encodeURIComponent(name)}`, {
        method: "PUT",
        body: json({ content }),
      }),
    remove: (name: string) => request(`/profile/${encodeURIComponent(name)}`, { method: "DELETE" }),
  },
  index: {
    status: () => request<IndexStatus>("/index/status"),
    rebuild: () => request<IndexStatus>("/index/rebuild", { method: "POST" }),
  },
  vacancies: {
    list: () => request<Vacancy[]>("/vacancies"),
    create: (input: { text?: string; url?: string }) =>
      request<Vacancy>("/vacancies", { method: "POST", body: json(input) }),
    remove: (id: string) => request(`/vacancies/${id}`, { method: "DELETE" }),
    match: (id: string) => request<MatchReport>(`/vacancies/${id}/match`),
  },
  cvs: {
    list: () => request<CvMeta[]>("/cvs"),
    get: (id: string) => request<CvDoc>(`/cvs/${id}`),
    save: (id: string, markdown: string, title?: string) =>
      request<CvDoc>(`/cvs/${id}`, { method: "PUT", body: json({ markdown, title }) }),
    remove: (id: string) => request(`/cvs/${id}`, { method: "DELETE" }),
    pdfUrl: (id: string) => `/api/cvs/${id}/pdf`,
  },
};

export interface GenerateHandlers {
  onStatus?: (message: string) => void;
  onMatch?: (report: MatchReport) => void;
  onDelta?: (text: string) => void;
}

/** Genera un CV leyendo el stream SSE del servidor. Resuelve con el CV guardado. */
export async function generateCv(
  vacancyId: string,
  instructions: string,
  handlers: GenerateHandlers,
  signal?: AbortSignal,
): Promise<CvDoc> {
  const res = await fetch("/api/cvs/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json({ vacancyId, instructions }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const raw of events) {
      const event = raw.match(/^event: (.*)$/m)?.[1] ?? "message";
      const data = [...raw.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]).join("\n");
      switch (event) {
        case "status":
          handlers.onStatus?.(data);
          break;
        case "match":
          handlers.onMatch?.(JSON.parse(data) as MatchReport);
          break;
        case "delta":
          handlers.onDelta?.(JSON.parse(data) as string);
          break;
        case "done":
          return JSON.parse(data) as CvDoc;
        case "error":
          throw new Error(data);
      }
    }
  }
  throw new Error("La generación terminó sin respuesta");
}

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
