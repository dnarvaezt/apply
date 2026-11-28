import { z } from "zod";

/** Lógica pura de la CLI `claude -p`: argumentos, env y lectura de la salida. El `spawn` vive en runner.ts. */

const DEFAULT_BIN = "claude";
const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_TIMEOUT_MS = 600_000;

export type ClaudeConfig = { bin: string; model: string; timeoutMs: number };

export function readClaudeConfig(env: NodeJS.ProcessEnv): ClaudeConfig {
  const timeout = Number(env.CLAUDE_TIMEOUT_MS);
  return {
    bin: env.CLAUDE_BIN || DEFAULT_BIN,
    model: env.CLAUDE_MODEL || DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/** La CLI rechaza el `$schema` 2020-12 que zod genera por defecto: se exige draft-07. */
export function toClaudeJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
}

export type ClaudeArgsInput = {
  model: string;
  system: string;
  jsonSchema: Record<string, unknown>;
  /** `stream-json` agrega `--verbose` para que la salida traiga el evento `init` (smoke). */
  outputFormat?: "json" | "stream-json";
  /** `stream-json` permite mandar bloques de imagen por stdin; la CLI exige entonces salida `stream-json`. */
  inputFormat?: "stream-json";
};

/** Banderas que aíslan la CLI: sin settings del usuario, sin herramientas, sin MCP y sin sesión. */
function isolationFlags(model: string, effort: "low" | "high", system: string): string[] {
  return [
    "--model",
    model,
    "--effort",
    effort,
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    system,
  ];
}

export type ClaudeImage = { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string };

/** Línea `stream-json` de stdin: un mensaje de usuario con la imagen (base64) y el texto. */
export function buildImageInput(prompt: string, image: ClaudeImage): string {
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.data },
        },
        { type: "text", text: prompt },
      ],
    },
  })}\n`;
}

export function buildClaudeArgs(input: ClaudeArgsInput): string[] {
  const format = input.inputFormat ? "stream-json" : (input.outputFormat ?? "json");
  return [
    "-p",
    ...(input.inputFormat ? ["--input-format", input.inputFormat] : []),
    "--output-format",
    format,
    ...(format === "stream-json" ? ["--verbose"] : []),
    "--json-schema",
    JSON.stringify(input.jsonSchema),
    ...isolationFlags(input.model, "low", input.system),
  ];
}

/** Texto libre en streaming (el CV): cada `text_delta` llega como un evento `stream_event`. */
export function buildClaudeStreamArgs(input: { model: string; system: string }): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    ...isolationFlags(input.model, "high", input.system),
  ];
}

export type ClaudeErrorKind =
  | "not-found"
  | "auth"
  | "rate-limit"
  | "failed"
  | "timeout"
  | "truncated"
  | "refused";

/** Fallo de la CLI con un mensaje que el usuario puede leer tal cual (API y SSE lo muestran). */
export class ClaudeCliError extends Error {
  readonly kind: ClaudeErrorKind;
  constructor(kind: ClaudeErrorKind, message: string) {
    super(message);
    this.name = "ClaudeCliError";
    this.kind = kind;
  }
}

export function notFoundError(bin: string): ClaudeCliError {
  return new ClaudeCliError(
    "not-found",
    `No se encontró el binario de Claude (${bin}). Instala la CLI o define CLAUDE_BIN.`,
  );
}

export type StreamEvent =
  | { kind: "delta"; text: string }
  | { kind: "result"; failure: ClaudeCliError | undefined }
  | { kind: "failure"; failure: ClaudeCliError }
  | { kind: "ignore" };

const IGNORE: StreamEvent = { kind: "ignore" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultFailure(result: Record<string, unknown>): ClaudeCliError | undefined {
  if (result.is_error) {
    const detail = typeof result.result === "string" ? result.result : "error sin detalle";
    return new ClaudeCliError("failed", `Claude falló: ${detail}`);
  }
  if (result.stop_reason === "max_tokens") {
    return new ClaudeCliError("truncated", "La respuesta se cortó por longitud.");
  }
  if (result.stop_reason === "refusal") {
    return new ClaudeCliError("refused", "El modelo rechazó generar el CV.");
  }
  return undefined;
}

/** Interpreta una línea de `--output-format stream-json`; lo que no importa al CV se ignora. */
export function parseStreamLine(line: string): StreamEvent {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return IGNORE;
  }
  if (!isRecord(event)) return IGNORE;
  if (event.type === "stream_event") {
    const inner = event.event;
    if (isRecord(inner) && inner.type === "content_block_delta" && isRecord(inner.delta)) {
      const { delta } = inner;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        return { kind: "delta", text: delta.text };
      }
    }
    return IGNORE;
  }
  if (event.type === "result") return { kind: "result", failure: resultFailure(event) };
  if (event.type === "system" && event.subtype === "api_retry") {
    if (event.error === "authentication_failed") {
      return {
        kind: "failure",
        failure: new ClaudeCliError(
          "auth",
          "Claude no está autenticado. Abre `claude` en una terminal e inicia sesión con /login.",
        ),
      };
    }
    if (event.error === "rate_limit") {
      return {
        kind: "failure",
        failure: new ClaudeCliError(
          "rate-limit",
          "Se alcanzó el límite de uso de la suscripción de Claude; intenta de nuevo más tarde.",
        ),
      };
    }
  }
  return IGNORE;
}

/** Con una `ANTHROPIC_*` en el env la CLI usa la API en vez de la suscripción: se quitan todas, incluso las vacías. */
export function buildClaudeEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...parent };
  for (const key of Object.keys(env)) {
    if (key.startsWith("ANTHROPIC_")) delete env[key];
  }
  return env;
}

type ResultEvent = { is_error?: boolean; result?: unknown; structured_output?: unknown };

/** `--output-format json` entrega un objeto; `stream-json` / `--verbose` entregan líneas o un arreglo de eventos. */
function parseEvents(stdout: string): Record<string, unknown>[] {
  const text = stdout.trim();
  try {
    const parsed: unknown = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
  } catch {
    const events: Record<string, unknown>[] = [];
    for (const line of text.split("\n")) {
      try {
        events.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        throw new Error("Claude devolvió una salida que no es JSON.");
      }
    }
    return events;
  }
}

function findResult(stdout: string): ResultEvent {
  const events = parseEvents(stdout);
  const result = events.findLast((e) => e?.type === "result");
  if (!result) throw new Error("Claude no devolvió un resultado.");
  return result as ResultEvent;
}

/** `what` va en los mensajes de error, p. ej. "la vacante estructurada". */
export function parseClaudeResult<T>(stdout: string, schema: z.ZodType<T>, what: string): T {
  const result = findResult(stdout);
  if (result.is_error) {
    throw new Error(
      `Claude falló: ${typeof result.result === "string" ? result.result : "error sin detalle"}`,
    );
  }
  if (result.structured_output === undefined || result.structured_output === null) {
    throw new Error(`Claude no devolvió ${what}`);
  }
  const parsed = schema.safeParse(result.structured_output);
  if (!parsed.success) {
    throw new Error(`Claude devolvió ${what} con un formato inválido: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Veredicto del smoke manual: exit ≠0 si la CLI no usó la suscripción o no devolvió salida estructurada. */
export function smokeVerdict(stdout: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let events: Record<string, unknown>[] = [];
  try {
    events = parseEvents(stdout);
  } catch (error) {
    reasons.push((error as Error).message);
  }
  const init = events.find((e) => e?.type === "system" && e.subtype === "init");
  if (init?.apiKeySource !== "none") {
    reasons.push(
      `apiKeySource es ${JSON.stringify(init?.apiKeySource ?? null)}, se esperaba "none"`,
    );
  }
  const result = events.findLast((e) => e?.type === "result") as ResultEvent | undefined;
  if (result?.structured_output === undefined || result.structured_output === null) {
    reasons.push("falta structured_output en el resultado");
  }
  return { ok: reasons.length === 0, reasons };
}
