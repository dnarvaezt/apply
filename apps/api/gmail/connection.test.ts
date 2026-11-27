import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAKE_GMAIL_ADDRESS, type FakeGoogle, startFakeGoogle } from "../test/fake-google.ts";
import type { GmailConfig } from "./config.ts";
import { createGmailConnection, type GmailConnection, isInvalidGrant } from "./connection.ts";
import { createTokenStore, type TokenStore } from "./token-store.ts";

let google: FakeGoogle;
let dir: string;
let store: TokenStore;
let gmail: GmailConnection;

const configFor = (fake: FakeGoogle, tokenDir: string): GmailConfig => ({
  clientId: "cliente-prueba",
  clientSecret: "secreto-prueba",
  tokenDir,
  authUrl: fake.authUrl,
  tokenUrl: fake.tokenUrl,
  apiRootUrl: fake.url,
});

beforeEach(async () => {
  google = await startFakeGoogle();
  dir = await mkdtemp(path.join(tmpdir(), "apply-gmail-"));
  store = createTokenStore(dir);
  gmail = createGmailConnection({ config: configFor(google, dir), store });
});

afterEach(async () => {
  gmail.close();
  await google.close();
  await rm(dir, { recursive: true, force: true });
});

/** Simula al usuario aprobando en el navegador: Google falso redirige al loopback. */
async function consent(authUrl: string) {
  const res = await fetch(authUrl);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  return { status: res.status, text: await res.text() };
}

async function connect() {
  const { authUrl } = await gmail.start();
  const done = await consent(authUrl);
  expect(done.status).toBe(200);
  return authUrl;
}

describe("consentimiento (REQ-001, REQ-002)", () => {
  it("AC-001: la URL pide PKCE S256, offline, loopback en 127.0.0.1 y solo los dos scopes", async () => {
    const { authUrl } = await gmail.start();
    const url = new URL(authUrl);
    expect(`${url.origin}${url.pathname}`).toBe(google.authUrl);
    const params = url.searchParams;
    expect(params.get("client_id")).toBe("cliente-prueba");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get("state")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(params.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
    expect(params.get("scope")?.split(" ")).toEqual([
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
  });

  it("cada inicio usa un puerto, un challenge y un state nuevos", async () => {
    const a = new URL((await gmail.start()).authUrl).searchParams;
    const b = new URL((await gmail.start()).authUrl).searchParams;
    expect(a.get("code_challenge")).not.toBe(b.get("code_challenge"));
    expect(a.get("state")).not.toBe(b.get("state"));
    // El loopback anterior se cerró al iniciar otro.
    await expect(
      fetch(`${a.get("redirect_uri")}?code=x&state=${a.get("state")}`),
    ).rejects.toThrow();
  });

  it("al aprobar guarda el refresh token 0600 con la cuenta y el estado queda conectado", async () => {
    expect(await gmail.status()).toEqual({ state: "disconnected", email: null });
    const { authUrl } = await gmail.start();
    const done = await consent(authUrl);
    expect(done).toEqual({ status: 200, text: expect.stringContaining("Gmail conectado") });

    // El token se pidió con el verificador PKCE y el mismo redirect_uri.
    const exchange = google.tokenRequests.find((r) => r.get("grant_type") === "authorization_code");
    expect(exchange?.get("code_verifier")).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(exchange?.get("redirect_uri")).toBe(new URL(authUrl).searchParams.get("redirect_uri"));

    expect(await store.read()).toEqual({
      refreshToken: "fake-refresh-1",
      email: FAKE_GMAIL_ADDRESS,
      reauthRequired: false,
    });
    expect((await stat(store.file)).mode & 0o777).toBe(0o600);
    expect(await gmail.status()).toEqual({ state: "connected", email: FAKE_GMAIL_ADDRESS });
    // Tras responder, el loopback se cierra.
    await expect(fetch(new URL(authUrl).searchParams.get("redirect_uri") ?? "")).rejects.toThrow();
  });

  it("un state distinto se rechaza y no guarda nada", async () => {
    const { authUrl } = await gmail.start();
    const redirect = new URL(authUrl).searchParams.get("redirect_uri") ?? "";
    const res = await fetch(`${redirect}?code=fake-code-1&state=otro`);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("se rechazó");
    expect(await store.read()).toBeNull();
  });

  it("un rechazo del usuario (sin code) no guarda nada", async () => {
    const { authUrl } = await gmail.start();
    const params = new URL(authUrl).searchParams;
    const res = await fetch(
      `${params.get("redirect_uri")}?error=access_denied&state=${params.get("state")}`,
    );
    expect(res.status).toBe(400);
    expect(await store.read()).toBeNull();
  });

  it("si el canje del code falla responde 502 y no guarda nada", async () => {
    const { authUrl } = await gmail.start();
    const params = new URL(authUrl).searchParams;
    const res = await fetch(
      `${params.get("redirect_uri")}?code=desconocido&state=${params.get("state")}`,
    );
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("No se pudo completar la conexión con Gmail");
    expect(await store.read()).toBeNull();
  });

  it("si Google no entrega refresh token responde 502 y no guarda nada", async () => {
    google.consentRefresh = false;
    const { authUrl } = await gmail.start();
    expect((await consent(authUrl)).status).toBe(502);
    expect(await store.read()).toBeNull();
  });

  it("el loopback escucha solo en 127.0.0.1, no en otras interfaces", async () => {
    const { authUrl } = await gmail.start();
    const port = new URL(new URL(authUrl).searchParams.get("redirect_uri") ?? "").port;
    await expect(fetch(`http://[::1]:${port}/oauth2callback`)).rejects.toThrow();
    expect((await consent(authUrl)).status).toBe(200);
  });

  it("close() cierra un loopback que sigue esperando", async () => {
    const { authUrl } = await gmail.start();
    gmail.close();
    await expect(fetch(authUrl)).rejects.toThrow();
  });

  it("otra ruta del loopback responde 404 y lo deja abierto", async () => {
    const { authUrl } = await gmail.start();
    const redirect = new URL(new URL(authUrl).searchParams.get("redirect_uri") ?? "");
    expect((await fetch(`${redirect.origin}/favicon.ico`)).status).toBe(404);
    expect((await consent(authUrl)).status).toBe(200);
  });

  it("el loopback se cierra solo si el usuario no responde a tiempo", async () => {
    gmail = createGmailConnection({ config: configFor(google, dir), store, consentTimeoutMs: 20 });
    const { authUrl } = await gmail.start();
    await new Promise((r) => setTimeout(r, 80));
    await expect(fetch(authUrl)).rejects.toThrow();
    expect(await store.read()).toBeNull();
  });
});

describe("refresh token (REQ-003, REQ-006)", () => {
  it("AC-002: un refresh token rotado reemplaza al guardado y el archivo sigue 0600", async () => {
    await connect();
    google.refreshMode = "rotate";
    expect(await gmail.status()).toEqual({ state: "connected", email: FAKE_GMAIL_ADDRESS });
    expect((await store.read())?.refreshToken).toBe("fake-refresh-2");
    expect((await stat(store.file)).mode & 0o777).toBe(0o600);
    const refresh = google.tokenRequests.filter((r) => r.get("grant_type") === "refresh_token");
    expect(refresh.at(-1)?.get("refresh_token")).toBe("fake-refresh-1");
  });

  it("AC-003: invalid_grant deja el estado en reauth required sin borrar la cuenta", async () => {
    await connect();
    google.refreshMode = "invalid_grant";
    expect(await gmail.status()).toEqual({ state: "reauth_required", email: FAKE_GMAIL_ADDRESS });
    expect(await store.read()).toEqual({
      refreshToken: "fake-refresh-1",
      email: FAKE_GMAIL_ADDRESS,
      reauthRequired: true,
    });

    // Mientras no se reconecte, no vuelve a molestar a Google.
    const calls = google.tokenRequests.length;
    expect((await gmail.status()).state).toBe("reauth_required");
    expect(google.tokenRequests).toHaveLength(calls);

    // Reconectar limpia el estado.
    google.refreshMode = "ok";
    await connect();
    expect(await gmail.status()).toEqual({ state: "connected", email: FAKE_GMAIL_ADDRESS });
  });

  it("sin rotación ni cambio de cuenta no reescribe el archivo de tokens", async () => {
    await connect();
    const writes: unknown[] = [];
    const counting: TokenStore = { ...store, write: async (t) => void writes.push(t) };
    gmail = createGmailConnection({ config: configFor(google, dir), store: counting });
    expect(await gmail.status()).toEqual({ state: "connected", email: FAKE_GMAIL_ADDRESS });
    expect(writes).toEqual([]);
  });

  it("si getProfile devuelve otra cuenta, actualiza la guardada", async () => {
    await connect();
    await store.write({
      refreshToken: "fake-refresh-1",
      email: "vieja@example.com",
      reauthRequired: false,
    });
    expect(await gmail.status()).toEqual({ state: "connected", email: FAKE_GMAIL_ADDRESS });
    expect((await store.read())?.email).toBe(FAKE_GMAIL_ADDRESS);
  });

  it("otro error de Google no se confunde con reauth y se propaga", async () => {
    await connect();
    await google.close();
    await expect(gmail.status()).rejects.toThrow();
    expect((await store.read())?.reauthRequired).toBe(false);
  });
});

describe("isInvalidGrant", () => {
  it.each([
    [{ response: { data: { error: "invalid_grant" } } }, true],
    [{ response: { data: { error: "invalid_client" } } }, false],
    [new Error("invalid_grant"), false],
    [null, false],
  ])("%j → %s", (error, expected) => {
    expect(isInvalidGrant(error)).toBe(expected);
  });
});
