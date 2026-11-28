import type { AddressInfo } from "node:net";
import type { CvDoc, MatchReport, Vacancy } from "@apply/shared";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamCv } from "../llm.ts";
import { useFakeClaude } from "../test/fake-claude.ts";
import { newVacancy } from "../test/fixtures.ts";
import type { CvsRepository } from "./repository.ts";
import { cvRoutes } from "./routes.ts";

// Integración real: @hono/node-server + fetch + el `claude` falso como proceso hijo (REQ-002, REQ-003).
const VACANCY: Vacancy = {
  ...newVacancy({ title: "Backend Engineer" }),
  id: "7",
  createdAt: "2026-11-01T00:00:00.000Z",
};
const REPORT = { vacancyId: "7", chunks: [] } as unknown as MatchReport;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(condition: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("la condición no se cumplió a tiempo");
    await new Promise((r) => setTimeout(r, 25));
  }
}

let fake: ReturnType<typeof useFakeClaude> | undefined;
let server: ReturnType<typeof serve> | undefined;
afterEach(async () => {
  fake?.restore();
  await new Promise((r) => (server ? server.close(r) : r(undefined)));
  server = undefined;
});

async function start(create: CvsRepository["create"]): Promise<string> {
  const app = new Hono().basePath("/api").route(
    "/",
    cvRoutes({
      repo: { create } as unknown as CvsRepository,
      getVacancy: async () => VACANCY,
      retrieve: async () => REPORT,
      streamCv,
      cleanMarkdown: (md) => md,
      renderPdf: async () => new Uint8Array(),
      matchReport: async () => {
        throw new Error("no se usa");
      },
    }),
  );
  const listening = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  server = listening;
  await new Promise((r) => listening.once("listening", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cvs/generate`;
}

async function generate(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vacancyId: "7" }),
    signal,
  });
}

describe("POST /cvs/generate con @hono/node-server real", () => {
  it("reemite los chunks de la CLI en orden por SSE y guarda el CV (AC-001)", async () => {
    fake = useFakeClaude({}, undefined, ["# Ana\n\n", "**Dev**\n", "fin"]);
    const create = vi.fn(async (input) => ({ id: "1", ...input }) as unknown as CvDoc);
    const res = await generate(await start(create));
    const body = await res.text();
    const deltas = [...body.matchAll(/event: delta\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]));
    expect(deltas).toEqual(["# Ana\n\n", "**Dev**\n", "fin"]);
    expect(body).toContain("event: done");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: "# Ana\n\n**Dev**\nfin" }),
    );
  });

  it("al desconectarse el cliente a mitad del stream mata al hijo y no guarda el CV (AC-004)", async () => {
    fake = useFakeClaude({}, "hang", ["primer trozo", "nunca llega"]);
    const create = vi.fn();
    const controller = new AbortController();
    const res = await generate(await start(create), controller.signal);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("la respuesta no trae cuerpo");
    const decoder = new TextDecoder();
    let seen = "";
    while (!seen.includes("primer trozo")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("el stream terminó antes del primer trozo");
      seen += decoder.decode(value);
    }
    const pid = fake.pid();
    expect(isAlive(pid)).toBe(true);

    controller.abort();
    await waitFor(() => !isAlive(pid));
    expect(isAlive(pid)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
