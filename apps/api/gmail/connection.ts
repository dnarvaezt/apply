import { randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { GmailConnectStart, GmailStatus } from "@apply/shared";
import { gmail as gmailApi } from "@googleapis/gmail";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { GMAIL_SCOPES, type GmailConfig } from "./config.ts";
import { boundPort } from "./loopback.ts";
import type { StoredTokens, TokenStore } from "./token-store.ts";

const CALLBACK_PATH = "/oauth2callback";
const CONSENT_TIMEOUT_MS = 5 * 60_000;

/** Google responde `invalid_grant` cuando el refresh token caducó o se revocó (OBS-02). */
const invalidGrant = z.object({
  response: z.object({ data: z.object({ error: z.literal("invalid_grant") }) }),
});
export const isInvalidGrant = (e: unknown) => invalidGrant.safeParse(e).success;

export interface GmailConnectionDeps {
  config: GmailConfig;
  store: TokenStore;
  consentTimeoutMs?: number;
}

function page(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Apply · Gmail</title><p>${message}</p>`);
}

/**
 * Conexión OAuth con Gmail (D8): app de escritorio con loopback en 127.0.0.1 y puerto aleatorio,
 * PKCE y `access_type=offline`. El refresh token vive solo en el `TokenStore`.
 */
export function createGmailConnection({
  config,
  store,
  consentTimeoutMs = CONSENT_TIMEOUT_MS,
}: GmailConnectionDeps) {
  let loopback: Server | null = null;

  const endpoints = {
    ...(config.authUrl && { oauth2AuthBaseUrl: config.authUrl }),
    ...(config.tokenUrl && { oauth2TokenUrl: config.tokenUrl }),
  };
  const newClient = (redirectUri?: string) =>
    new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
      endpoints,
    });

  async function profileEmail(auth: OAuth2Client): Promise<string | null> {
    const api = gmailApi({
      version: "v1",
      auth,
      ...(config.apiRootUrl && { rootUrl: config.apiRootUrl }),
    });
    const { data } = await api.users.getProfile({ userId: "me" });
    return data.emailAddress ?? null;
  }

  function close(server: Server) {
    server.closeAllConnections();
    server.close();
    if (loopback === server) loopback = null;
  }

  /** Abre el loopback y devuelve la URL de consentimiento; el callback guarda los tokens. */
  async function start(): Promise<GmailConnectStart> {
    if (loopback) close(loopback);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    loopback = server;

    const redirectUri = `http://127.0.0.1:${boundPort(server.address())}${CALLBACK_PATH}`;
    const client = newClient(redirectUri);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(16).toString("base64url");
    const timer = setTimeout(() => close(server), consentTimeoutMs);
    timer.unref();

    server.on("request", async (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      res.on("finish", () => {
        clearTimeout(timer);
        close(server);
      });
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.get("state") !== state) {
        page(
          res,
          400,
          "La autorización se rechazó o no es válida. Vuelve a Apply e inténtalo de nuevo.",
        );
        return;
      }
      try {
        const { tokens } = await client.getToken({ code, codeVerifier });
        if (!tokens.refresh_token) throw new Error("Google no devolvió un refresh token");
        client.setCredentials(tokens);
        const email = await profileEmail(client);
        await store.write({ refreshToken: tokens.refresh_token, email, reauthRequired: false });
        page(res, 200, "Gmail conectado. Ya puedes cerrar esta pestaña y volver a Apply.");
      } catch (e) {
        console.error(
          "Gmail: no se pudo completar la conexión:",
          e instanceof Error ? e.message : e,
        );
        page(
          res,
          502,
          "No se pudo completar la conexión con Gmail. Vuelve a Apply e inténtalo de nuevo.",
        );
      }
    });

    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GMAIL_SCOPES],
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      state,
    });
    return { authUrl };
  }

  /** Cliente con el refresh token guardado; si Google lo rota, el nuevo reemplaza al guardado. */
  function authorized(saved: StoredTokens) {
    const client = newClient();
    client.setCredentials({ refresh_token: saved.refreshToken });
    let rotated: string | null = null;
    client.on("tokens", (tokens) => {
      if (tokens.refresh_token) rotated = tokens.refresh_token;
    });
    return { client, rotated: () => rotated };
  }

  /** Estado real: refresca el token y pregunta a Google qué cuenta está conectada (REQ-005). */
  async function status(): Promise<GmailStatus> {
    const saved = await store.read();
    if (!saved) return { state: "disconnected", email: null };
    if (saved.reauthRequired) return { state: "reauth_required", email: saved.email };
    const { client, rotated } = authorized(saved);
    try {
      const email = await profileEmail(client);
      const refreshToken = rotated() ?? saved.refreshToken;
      if (refreshToken !== saved.refreshToken || email !== saved.email) {
        await store.write({ ...saved, refreshToken, email });
      }
      return { state: "connected", email };
    } catch (e) {
      if (!isInvalidGrant(e)) throw e;
      await store.write({ ...saved, reauthRequired: true });
      return { state: "reauth_required", email: saved.email };
    }
  }

  return {
    start,
    status,
    close: () => {
      if (loopback) close(loopback);
    },
  };
}

export type GmailConnection = ReturnType<typeof createGmailConnection>;
