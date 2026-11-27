import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { boundPort } from "../gmail/loopback.ts";

/** Cuenta que "conecta" el Google falso; dominio reservado, nunca una cuenta real. */
export const FAKE_GMAIL_ADDRESS = "postulante@example.com";

/** Qué responde el endpoint de token al refrescar. */
export type RefreshMode = "ok" | "rotate" | "invalid_grant";

/** Qué hace `messages.send`: enviar, responder 400, o enviar y cortar la conexión (resultado perdido). */
export type SendMode = "ok" | "reject" | "drop" | "no_id";

export interface FakeSent {
  raw: string;
  messageId: string | null;
  id: string;
  threadId: string;
}

export interface FakeGoogle {
  /** Raíz con `/` final: sirve de `GMAIL_API_ROOT_URL`. */
  url: string;
  authUrl: string;
  tokenUrl: string;
  /** Parámetros de cada visita a la pantalla de consentimiento. */
  authRequests: URLSearchParams[];
  /** Cuerpo de cada llamada al endpoint de token. */
  tokenRequests: URLSearchParams[];
  refreshMode: RefreshMode;
  /** Si el canje del code entrega refresh token (Google lo omite si ya hubo consentimiento). */
  consentRefresh: boolean;
  sendMode: SendMode;
  /** Mensajes que Gmail falso "envió", en orden. */
  sent: FakeSent[];
  /** Consulta `q` de cada `messages.list`. */
  searches: string[];
  /** Se llama justo antes de aceptar un envío: permite mirar qué se persistió antes (AC-004). */
  beforeSend: (() => Promise<void>) | null;
  close: () => Promise<void>;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * Google falso en la frontera HTTP (D9): consentimiento que aprueba solo y redirige al loopback,
 * endpoint de token que valida PKCE, `users.getProfile`, `messages.send` y `messages.list`.
 */
export async function startFakeGoogle(port = 0): Promise<FakeGoogle> {
  const pending = new Map<string, { challenge: string; redirectUri: string }>();
  const access = new Set<string>();
  let issued = 0;

  const fake: FakeGoogle = {
    url: "",
    authUrl: "",
    tokenUrl: "",
    authRequests: [],
    tokenRequests: [],
    refreshMode: "ok",
    consentRefresh: true,
    sendMode: "ok",
    sent: [],
    searches: [],
    beforeSend: null,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };

  const newAccess = () => {
    issued += 1;
    const token = `fake-access-${issued}`;
    access.add(token);
    return token;
  };

  async function token(req: IncomingMessage, res: ServerResponse) {
    const form = new URLSearchParams(await body(req));
    fake.tokenRequests.push(form);
    const invalid = () =>
      json(res, 400, { error: "invalid_grant", error_description: "Bad Request" });

    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? "";
      const expected = pending.get(code);
      pending.delete(code);
      const verifier = form.get("code_verifier") ?? "";
      if (
        !expected ||
        challengeOf(verifier) !== expected.challenge ||
        form.get("redirect_uri") !== expected.redirectUri
      ) {
        return invalid();
      }
      const refresh = fake.consentRefresh ? { refresh_token: "fake-refresh-1" } : {};
      return json(res, 200, {
        access_token: newAccess(),
        expires_in: 3600,
        token_type: "Bearer",
        ...refresh,
      });
    }

    if (form.get("grant_type") === "refresh_token") {
      if (fake.refreshMode === "invalid_grant") {
        return json(res, 400, {
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        });
      }
      const rotated = fake.refreshMode === "rotate" ? { refresh_token: "fake-refresh-2" } : {};
      return json(res, 200, {
        access_token: newAccess(),
        expires_in: 3600,
        token_type: "Bearer",
        ...rotated,
      });
    }
    return invalid();
  }

  async function send(req: IncomingMessage, res: ServerResponse) {
    const { raw } = JSON.parse(await body(req)) as { raw: string };
    await fake.beforeSend?.();
    if (fake.sendMode === "reject") {
      return json(res, 400, { error: { code: 400, message: "Invalid To header" } });
    }
    if (fake.sendMode === "no_id") return json(res, 200, {});
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const n = fake.sent.length + 1;
    const message: FakeSent = {
      raw,
      messageId: decoded.match(/^Message-ID: (.+?)\r?$/im)?.[1] ?? null,
      id: `fake-msg-${n}`,
      threadId: `fake-thread-${n}`,
    };
    fake.sent.push(message);
    if (fake.sendMode === "drop") return void res.destroy();
    return json(res, 200, { id: message.id, threadId: message.threadId, labelIds: ["SENT"] });
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/o/oauth2/v2/auth") {
      fake.authRequests.push(url.searchParams);
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const code = `fake-code-${fake.authRequests.length}`;
      pending.set(code, { challenge: url.searchParams.get("code_challenge") ?? "", redirectUri });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }

    if (req.method === "POST" && url.pathname === "/token") return void token(req, res);

    const bearer = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!access.has(bearer))
      return json(res, 401, { error: { code: 401, message: "Unauthorized" } });

    if (req.method === "GET" && url.pathname === "/gmail/v1/users/me/profile") {
      return json(res, 200, { emailAddress: FAKE_GMAIL_ADDRESS, messagesTotal: 0 });
    }
    if (req.method === "POST" && url.pathname === "/gmail/v1/users/me/messages/send") {
      return void send(req, res);
    }
    if (req.method === "GET" && url.pathname === "/gmail/v1/users/me/messages") {
      const q = url.searchParams.get("q") ?? "";
      fake.searches.push(q);
      const wanted = q.match(/^rfc822msgid:(.+)$/)?.[1];
      const found = fake.sent.filter((m) => m.messageId === `<${wanted}>`);
      const messages = found.map(({ id, threadId }) => ({ id, threadId }));
      return json(res, 200, messages.length ? { messages, resultSizeEstimate: 1 } : {});
    }
    return json(res, 404, { error: { code: 404, message: `Sin ruta: ${url.pathname}` } });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  fake.url = `http://127.0.0.1:${boundPort(server.address())}/`;
  fake.authUrl = `${fake.url}o/oauth2/v2/auth`;
  fake.tokenUrl = `${fake.url}token`;
  return fake;
}
