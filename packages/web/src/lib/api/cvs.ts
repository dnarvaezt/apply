import type { CvDoc, CvMatchReport, CvMeta, MatchReport } from "@apply/shared";
import { json, request } from "./http.ts";

export const cvsApi = {
  list: () => request<CvMeta[]>("/cvs"),
  get: (id: string) => request<CvDoc>(`/cvs/${id}`),
  match: (id: string) => request<CvMatchReport>(`/cvs/${id}/match`),
  save: (id: string, markdown: string, title?: string) =>
    request<CvDoc>(`/cvs/${id}`, { method: "PUT", body: json({ markdown, title }) }),
  remove: (id: string) => request(`/cvs/${id}`, { method: "DELETE" }),
  pdfUrl: (id: string) => `/api/cvs/${id}/pdf`,
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
