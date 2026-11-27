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
