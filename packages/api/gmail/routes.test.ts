import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GmailConnectStart, GmailStatus } from "@apply/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { startFakeGoogle } from "../test/fake-google.ts";
import { createGmailConnection } from "./connection.ts";
import { gmailRoutes } from "./routes.ts";
import { createTokenStore } from "./token-store.ts";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

const app = (deps: Parameters<typeof gmailRoutes>[0]) =>
  new Hono().basePath("/api").route("/", gmailRoutes(deps));

describe("rutas de Gmail", () => {
  it("AC-004: sin configuración la api responde Gmail no configurado y no inicia OAuth", async () => {
    const api = app({ gmail: null });
    const status = await api.request("/api/gmail/status");
    expect(status.status).toBe(200);
    expect((await status.json()) as GmailStatus).toEqual({ state: "not_configured", email: null });
    const connect = await api.request("/api/gmail/connect", { method: "POST" });
    expect(connect.status).toBe(409);
    expect(await connect.json()).toEqual({ error: expect.stringContaining("GOOGLE_CLIENT_ID") });
  });

  it("con configuración informa desconectado e inicia el consentimiento", async () => {
    const google = await startFakeGoogle();
    const dir = await mkdtemp(path.join(tmpdir(), "apply-gmail-routes-"));
    const gmail = createGmailConnection({
      config: {
        clientId: "c",
        clientSecret: "s",
        tokenDir: dir,
        authUrl: google.authUrl,
        tokenUrl: google.tokenUrl,
        apiRootUrl: google.url,
      },
      store: createTokenStore(dir),
    });
    cleanups.push(
      () => google.close(),
      () => rm(dir, { recursive: true, force: true }),
      gmail.close,
    );
    const api = app({ gmail });

    expect(await (await api.request("/api/gmail/status")).json()).toEqual({
      state: "disconnected",
      email: null,
    });
    const res = await api.request("/api/gmail/connect", { method: "POST" });
    expect(res.status).toBe(200);
    const { authUrl } = (await res.json()) as GmailConnectStart;
    expect(authUrl.startsWith(google.authUrl)).toBe(true);
  });
});
