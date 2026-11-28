import { randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { GmailConnectStart, GmailStatus } from "@apply/shared";
import { type gmail_v1, gmail as gmailApi } from "@googleapis/gmail";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { GMAIL_SCOPES, type GmailConfig } from "./config.ts";
import { boundPort } from "./loopback.ts";
import { type GmailMessageMeta, messageMeta } from "./replies.ts";
import type { StoredTokens, TokenStore } from "./token-store.ts";

const CALLBACK_PATH = "/oauth2callback";
const CONSENT_TIMEOUT_MS = 5 * 60_000;
/** Ninguna llamada a Gmail espera para siempre; un envío sin respuesta queda ambiguo (#21). */
const API_TIMEOUT_MS = 30_000;

/** Google responde `invalid_grant` cuando el refresh token caducó o se revocó (OBS-02). */
const invalidGrant = z.object({
  response: z.object({ data: z.object({ error: z.literal("invalid_grant") }) }),
});
export const isInvalidGrant = (e: unknown) => invalidGrant.safeParse(e).success;

/** No hay cuenta usable: sin conectar o con reauth pendiente. No se llegó a llamar a Gmail. */
export class GmailUnavailableError extends Error {
  readonly state: "disconnected" | "reauth_required";
  readonly email: string | null;

  constructor(state: GmailUnavailableError["state"], email: string | null) {
    super(
      state === "disconnected"
        ? "Gmail no está conectado: conéctalo en la pestaña Gmail"
        : "Gmail pide volver a conectar la cuenta (reauth required)",
    );
    this.state = state;
    this.email = email;
  }
}

/** Ids que Gmail asigna a un mensaje enviado. */
export interface GmailMessageRef {
  id: string;
  threadId: string;
}

function messageRef(data: { id?: string | null; threadId?: string | null }): GmailMessageRef {
  if (!data.id || !data.threadId) throw new Error("Gmail respondió sin id o threadId");
  return { id: data.id, threadId: data.threadId };
}

/** Tope de mensajes por búsqueda: la detección lee una página, nunca el buzón entero. */
const SEARCH_LIMIT = 50;

/** Lectura del buzón para detectar respuestas (#22), dentro de una sesión ya autorizada. */
export interface GmailReader {
  /** Cuenta conectada; `null` si Google no la informó. */
  account: string | null;
  /** Mensajes del hilo (`threads.get`); vacío si el hilo ya no existe. */
  thread(threadId: string): Promise<GmailMessageMeta[]>;
  /** Mensajes que cumplen `q` (`messages.list` + `messages.get`), hasta `SEARCH_LIMIT`. */
  search(q: string): Promise<GmailMessageMeta[]>;
}

const isNotFound = (e: unknown) =>
  z.object({ response: z.object({ status: z.literal(404) }) }).safeParse(e).success;

const metas = (messages: Parameters<typeof messageMeta>[0][]) =>
  messages.map(messageMeta).filter((m): m is GmailMessageMeta => m !== null);

function readerFor(api: gmail_v1.Gmail, account: string | null): GmailReader {
  const metadata = { format: "metadata", metadataHeaders: ["From"] };
  return {
    account,
    async thread(threadId) {
      try {
        const { data } = await api.users.threads.get({ userId: "me", id: threadId, ...metadata });
        return metas(data.messages ?? []);
      } catch (e) {
        if (isNotFound(e)) return [];
        throw e;
      }
    },
    async search(q) {
      const { data } = await api.users.messages.list({ userId: "me", q, maxResults: SEARCH_LIMIT });
      const found = [];
      for (const { id } of data.messages ?? []) {
        if (!id) continue;
        found.push((await api.users.messages.get({ userId: "me", id, ...metadata })).data);
      }
      return metas(found);
    },
  };
}

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

  const apiFor = (auth: OAuth2Client) =>
    gmailApi({
      version: "v1",
      auth,
      timeout: API_TIMEOUT_MS,
      ...(config.apiRootUrl && { rootUrl: config.apiRootUrl }),
    });

  async function profileEmail(api: gmail_v1.Gmail): Promise<string | null> {
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
        const email = await profileEmail(apiFor(client));
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

  /**
   * Corre `fn` con la cuenta guardada. Un refresh token rotado se guarda aunque `fn` falle;
   * `invalid_grant` deja la cuenta en reauth y falla con `GmailUnavailableError` (OBS-07).
   */
  async function withGmail<T>(
    fn: (api: gmail_v1.Gmail, saved: StoredTokens) => Promise<T>,
    accountOf: (result: T, saved: StoredTokens) => string | null = (_, saved) => saved.email,
  ): Promise<T> {
    const saved = await store.read();
    if (!saved) throw new GmailUnavailableError("disconnected", null);
    if (saved.reauthRequired) throw new GmailUnavailableError("reauth_required", saved.email);
    const { client, rotated } = authorized(saved);
    const keep = async (email: string | null) => {
      const refreshToken = rotated() ?? saved.refreshToken;
      if (refreshToken !== saved.refreshToken || email !== saved.email) {
        await store.write({ ...saved, refreshToken, email });
      }
    };
    try {
      const result = await fn(apiFor(client), saved);
      await keep(accountOf(result, saved));
      return result;
    } catch (e) {
      if (!isInvalidGrant(e)) {
        await keep(saved.email);
        throw e;
      }
      await store.write({ ...saved, reauthRequired: true });
      throw new GmailUnavailableError("reauth_required", saved.email);
    }
  }

  /** Estado real: refresca el token y pregunta a Google qué cuenta está conectada (REQ-005). */
  async function status(): Promise<GmailStatus> {
    try {
      const email = await withGmail(profileEmail, (found) => found);
      return { state: "connected", email };
    } catch (e) {
      if (e instanceof GmailUnavailableError) return { state: e.state, email: e.email };
      throw e;
    }
  }

  /** `users.messages.send` con el MIME ya construido en base64url (D8). */
  const send = (raw: string) =>
    withGmail(async (api) => {
      const { data } = await api.users.messages.send({ userId: "me", requestBody: { raw } });
      return messageRef(data);
    });

  /** Dedupe (#5): busca un envío previo por su Message-ID propio; `null` si no salió. */
  const findSent = (messageId: string) =>
    withGmail(async (api) => {
      const bare = messageId.replace(/^<|>$/g, "");
      const { data } = await api.users.messages.list({
        userId: "me",
        q: `rfc822msgid:${bare}`,
        maxResults: 1,
      });
      const [found] = data.messages ?? [];
      return found ? messageRef(found) : null;
    });

  /** Corre `fn` con un lector del buzón; falla con `GmailUnavailableError` sin cuenta usable. */
  const read = <T>(fn: (reader: GmailReader) => Promise<T>) =>
    withGmail((api, saved) => fn(readerFor(api, saved.email)));

  return {
    start,
    status,
    send,
    findSent,
    read,
    close: () => {
      if (loopback) close(loopback);
    },
  };
}

export type GmailConnection = ReturnType<typeof createGmailConnection>;
