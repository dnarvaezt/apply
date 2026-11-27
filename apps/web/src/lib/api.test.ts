import type { CvDoc, MatchReport } from "@apply/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, generateCv } from "./api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | (() => Response)) {
  const fetchMock = vi.fn(async () => (typeof response === "function" ? response() : response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api", () => {
  it("prefija /api, envía JSON y devuelve el cuerpo", async () => {
    const fetchMock = stubFetch(jsonResponse([{ name: "a.md" }]));
    expect(await api.profile.list()).toEqual([{ name: "a.md" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/profile");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("serializa el cuerpo y codifica el nombre en la URL", async () => {
    const fetchMock = stubFetch(jsonResponse({ name: "mi cv.md" }));
    await api.profile.save("mi cv.md", "hola");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/profile/mi%20cv.md");
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ content: "hola" }));
  });

  it("usa el mensaje de error del servidor", async () => {
    stubFetch(jsonResponse({ error: "Vacante no encontrada" }, 404));
    await expect(api.vacancies.match("x")).rejects.toThrow("Vacante no encontrada");
  });

  it("cae a 'Error <status>' si el cuerpo no es JSON o no trae error", async () => {
    stubFetch(new Response("boom", { status: 502 }));
    await expect(api.cvs.list()).rejects.toThrow("Error 502");
    stubFetch(jsonResponse({}, 500));
    await expect(api.cvs.list()).rejects.toThrow("Error 500");
  });

  it("arma los verbos y rutas de vacantes y CVs", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    await api.vacancies.create({ text: "t" });
    await api.vacancies.update("v1", { posterName: "Ana", postedAt: null });
    await api.vacancies.remove("v1");
    await api.cvs.save("c1", "md", "Título");
    await api.cvs.remove("c1");
    await api.index.rebuild();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([u, i]) => `${i.method} ${u}`)).toEqual([
      "POST /api/vacancies",
      "PATCH /api/vacancies/v1",
      "DELETE /api/vacancies/v1",
      "PUT /api/cvs/c1",
      "DELETE /api/cvs/c1",
      "POST /api/index/rebuild",
    ]);
    expect(calls[1][1].body).toBe(JSON.stringify({ posterName: "Ana", postedAt: null }));
    expect(calls[3][1].body).toBe(JSON.stringify({ markdown: "md", title: "Título" }));
    expect(api.cvs.pdfUrl("c1")).toBe("/api/cvs/c1/pdf");
  });

  it("arma las rutas de lectura de perfil, índice, vacantes y CVs", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    await api.profile.remove("mi cv.md");
    await api.index.status();
    await api.vacancies.list();
    await api.vacancies.match("v1");
    await api.cvs.list();
    await api.cvs.get("c1");
    await api.cvs.match("c1");
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "DELETE /api/profile/mi%20cv.md",
      "GET /api/index/status",
      "GET /api/vacancies",
      "GET /api/vacancies/v1/match",
      "GET /api/cvs",
      "GET /api/cvs/c1",
      "GET /api/cvs/c1/match",
    ]);
  });
});

describe("api.applications", () => {
  it("lista, filtra por vacante, lee la línea de tiempo y crea con POST", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    await api.applications.list();
    await api.applications.list("v 1");
    await api.applications.timeline("a1");
    await api.applications.create({ vacancyId: "v1", cvId: "c1" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "GET /api/applications",
      "GET /api/applications?vacancyId=v%201",
      "GET /api/applications/a1",
      "POST /api/applications",
    ]);
    expect(calls[3][1]?.body).toBe(JSON.stringify({ vacancyId: "v1", cvId: "c1" }));
  });

  it("registra eventos, lista canales y gestiona contactos de la postulación", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    await api.applications.addEvent("a1", { type: "interview", source: "manual" });
    await api.applications.channels();
    await api.contacts.add("a1", { name: "Ana", isProcessStart: true });
    await api.contacts.update("c 1", { name: "Ana P." });
    await api.contacts.markProcessStart("a1", "c1", false);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "POST /api/applications/a1/events",
      "GET /api/channels",
      "POST /api/applications/a1/contacts",
      "PUT /api/contacts/c%201",
      "PATCH /api/applications/a1/contacts/c1",
    ]);
    expect(calls.map(([, i]) => i?.body)).toEqual([
      JSON.stringify({ type: "interview", source: "manual" }),
      undefined,
      JSON.stringify({ name: "Ana", isProcessStart: true }),
      JSON.stringify({ name: "Ana P." }),
      JSON.stringify({ isProcessStart: false }),
    ]);
  });

  it("pide las métricas de seguimiento a GET /metrics", async () => {
    const fetchMock = stubFetch(jsonResponse({ applications: 3 }));
    expect(await api.metrics.tracking()).toEqual({ applications: 3 });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/metrics");
  });

  it("consulta el estado de Gmail e inicia la conexión con POST", async () => {
    const fetchMock = stubFetch(jsonResponse({ state: "disconnected", email: null }));
    expect(await api.gmail.status()).toEqual({ state: "disconnected", email: null });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/gmail/status");

    const connectMock = stubFetch(jsonResponse({ authUrl: "https://accounts.example/auth" }));
    expect(await api.gmail.connect()).toEqual({ authUrl: "https://accounts.example/auth" });
    const [url, init] = connectMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/gmail/connect");
    expect(init.method).toBe("POST");
  });
});

function sse(...events: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const e of events) controller.enqueue(enc.encode(e));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

const CV = { id: "cv1", title: "CV" } as unknown as CvDoc;
const REPORT = { score: 1 } as unknown as MatchReport;

describe("generateCv", () => {
  it("despacha eventos SSE a los handlers y resuelve con el CV", async () => {
    stubFetch(
      sse(
        "event: status\ndata: Buscando\n\n",
        `event: match\ndata: ${JSON.stringify(REPORT)}\n\nevent: delta\ndata: "Hol`,
        `a"\n\nevent: done\ndata: ${JSON.stringify(CV)}\n\n`,
      ),
    );
    const onStatus = vi.fn();
    const onMatch = vi.fn();
    const onDelta = vi.fn();
    const result = await generateCv("v1", "ins", { onStatus, onMatch, onDelta });
    expect(result).toEqual(CV);
    expect(onStatus).toHaveBeenCalledWith("Buscando");
    expect(onMatch).toHaveBeenCalledWith(REPORT);
    expect(onDelta).toHaveBeenCalledWith("Hola");
  });

  it("une líneas data múltiples con salto de línea", async () => {
    stubFetch(
      sse("event: status\ndata: a\ndata: b\n\n", `event: done\ndata: ${JSON.stringify(CV)}\n\n`),
    );
    const onStatus = vi.fn();
    await generateCv("v1", "", { onStatus });
    expect(onStatus).toHaveBeenCalledWith("a\nb");
  });

  it("envía vacante e instrucciones en el cuerpo", async () => {
    const fetchMock = stubFetch(sse(`event: done\ndata: ${JSON.stringify(CV)}\n\n`));
    await generateCv("v1", "corto", {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cvs/generate");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ vacancyId: "v1", instructions: "corto" }));
  });

  it("lanza el mensaje de un evento error", async () => {
    stubFetch(sse("event: error\ndata: se cayó\n\n"));
    await expect(generateCv("v1", "", {})).rejects.toThrow("se cayó");
  });

  it("falla si el stream termina sin evento done", async () => {
    stubFetch(sse("event: status\ndata: x\n\n"));
    await expect(generateCv("v1", "", {})).rejects.toThrow("La generación terminó sin respuesta");
  });

  it("falla con el error HTTP del servidor", async () => {
    stubFetch(jsonResponse({ error: "sin vacante" }, 400));
    await expect(generateCv("v1", "", {})).rejects.toThrow("sin vacante");
    stubFetch(new Response("x", { status: 500 }));
    await expect(generateCv("v1", "", {})).rejects.toThrow("Error 500");
  });
});

describe("api.emailDrafts", () => {
  it("lee el borrador del CV, lo genera con POST y lo guarda con PUT", async () => {
    const fetchMock = stubFetch(() => jsonResponse(null));
    expect(await api.emailDrafts.forCv("c 1")).toBeNull();
    await api.emailDrafts.generate("c1");
    await api.emailDrafts.save("e1", { to: "ana@example.com", subject: "S", body: "B" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "GET /api/cvs/c%201/email-draft",
      "POST /api/cvs/c1/email-draft",
      "PUT /api/email-drafts/e1",
    ]);
    expect(calls[1][1]?.body).toBe("{}");
    expect(calls[2][1]?.body).toBe(
      JSON.stringify({ to: "ana@example.com", subject: "S", body: "B" }),
    );
  });
});
