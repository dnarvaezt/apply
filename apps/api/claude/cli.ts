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
    "--model",
    input.model,
    "--effort",
    "low",
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt",
    input.system,
  ];
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
