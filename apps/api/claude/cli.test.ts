import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildClaudeArgs,
  buildClaudeEnv,
  buildClaudeStreamArgs,
  buildImageInput,
  ClaudeCliError,
  notFoundError,
  parseClaudeResult,
  parseStreamLine,
  readClaudeConfig,
  smokeVerdict,
  toClaudeJsonSchema,
} from "./cli.ts";

const Schema = z.object({ title: z.string(), n: z.number().nullable() });
const ok = (structured_output: unknown) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output });

describe("readClaudeConfig (REQ-002)", () => {
  it("usa los defaults sin variables", () => {
    expect(readClaudeConfig({})).toEqual({
      bin: "claude",
      model: "claude-opus-5-5",
      timeoutMs: 600_000,
    });
  });

  it("lee CLAUDE_BIN, CLAUDE_MODEL y CLAUDE_TIMEOUT_MS", () => {
    expect(
      readClaudeConfig({ CLAUDE_BIN: "/x/claude", CLAUDE_MODEL: "m", CLAUDE_TIMEOUT_MS: "1500" }),
    ).toEqual({ bin: "/x/claude", model: "m", timeoutMs: 1500 });
  });

  it("ignora un timeout inválido o no positivo", () => {
    for (const bad of ["abc", "0", "-5", ""]) {
      expect(readClaudeConfig({ CLAUDE_TIMEOUT_MS: bad }).timeoutMs).toBe(600_000);
    }
  });
});

describe("toClaudeJsonSchema (REQ-004)", () => {
  it("genera un esquema draft-07", () => {
    const schema = toClaudeJsonSchema(Schema);
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.properties).toHaveProperty("title");
  });
});

describe("buildClaudeArgs (AC-002)", () => {
  const args = buildClaudeArgs({ model: "modelo-x", system: "SISTEMA", jsonSchema: { a: 1 } });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  it("incluye cada bandera con su valor", () => {
    expect(args).toContain("-p");
    expect(after("--output-format")).toBe("json");
    expect(after("--json-schema")).toBe('{"a":1}');
    expect(after("--model")).toBe("modelo-x");
    expect(after("--effort")).toBe("low");
    expect(after("--setting-sources")).toBe("");
    expect(after("--tools")).toBe("");
    expect(after("--system-prompt")).toBe("SISTEMA");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
  });

  it("no usa --bare ni --verbose en modo json", () => {
    expect(args).not.toContain("--bare");
    expect(args).not.toContain("--verbose");
  });

  it("stream-json agrega --verbose", () => {
    const stream = buildClaudeArgs({
      model: "m",
      system: "s",
      jsonSchema: {},
      outputFormat: "stream-json",
    });
    expect(stream[stream.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(stream).toContain("--verbose");
  });
});

describe("entrada con imagen (REQ-002)", () => {
  const base = { model: "m", system: "s", jsonSchema: {} };

  it("inputFormat stream-json agrega --input-format y fuerza la salida stream-json", () => {
    const args = buildClaudeArgs({ ...base, inputFormat: "stream-json" });
    expect(args[args.indexOf("--input-format") + 1]).toBe("stream-json");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).toContain("--verbose");
  });

  it("sin inputFormat no hay --input-format", () => {
    expect(buildClaudeArgs(base)).not.toContain("--input-format");
  });

  it("buildImageInput arma una línea JSON de mensaje de usuario con imagen y texto", () => {
    const line = buildImageInput("lee esto", { mediaType: "image/png", data: "QUJD" });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
          { type: "text", text: "lee esto" },
        ],
      },
    });
  });
});

describe("buildClaudeEnv (AC-003)", () => {
  it("quita toda ANTHROPIC_*, incluso vacía, y conserva el resto", () => {
    const env = buildClaudeEnv({
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_BASE_URL: "http://x",
      ANTHROPIC_AUTH_TOKEN: "t",
      ANTHROPIC_OTRA: "y",
      PATH: "/bin",
      HOME: "/h",
    });
    expect(Object.keys(env).sort()).toEqual(["HOME", "PATH"]);
  });

  it("no muta el env del padre", () => {
    const parent = { ANTHROPIC_API_KEY: "k" };
    buildClaudeEnv(parent);
    expect(parent).toEqual({ ANTHROPIC_API_KEY: "k" });
  });
});

describe("parseClaudeResult (REQ-007)", () => {
  it("devuelve structured_output validado con zod", () => {
    expect(
      parseClaudeResult(ok({ title: "t", n: null }), Schema, "la vacante estructurada"),
    ).toEqual({
      title: "t",
      n: null,
    });
  });

  it("falla con is_error y muestra el detalle", () => {
    const out = JSON.stringify({ type: "result", is_error: true, result: "límite alcanzado" });
    expect(() => parseClaudeResult(out, Schema, "la vacante estructurada")).toThrow(
      "Claude falló: límite alcanzado",
    );
  });

  it("falla con is_error sin texto de detalle", () => {
    const out = JSON.stringify({ type: "result", is_error: true });
    expect(() => parseClaudeResult(out, Schema, "la vacante estructurada")).toThrow(
      "Claude falló: error sin detalle",
    );
  });

  it("falla si success no trae structured_output", () => {
    const out = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "hola",
    });
    expect(() => parseClaudeResult(out, Schema, "la vacante estructurada")).toThrow(
      "Claude no devolvió la vacante estructurada",
    );
  });

  it("trata structured_output null como ausente", () => {
    expect(() => parseClaudeResult(ok(null), Schema, "la vacante estructurada")).toThrow(
      "Claude no devolvió la vacante estructurada",
    );
  });

  it("falla si structured_output no valida con zod", () => {
    expect(() => parseClaudeResult(ok({ title: 3 }), Schema, "la vacante estructurada")).toThrow(
      /Claude devolvió la vacante estructurada con un formato inválido/,
    );
  });

  it("falla con salida que no es JSON", () => {
    expect(() => parseClaudeResult("hola", Schema, "x")).toThrow("no es JSON");
  });

  it("falla si no hay evento result", () => {
    expect(() => parseClaudeResult('{"type":"system"}', Schema, "x")).toThrow(
      "Claude no devolvió un resultado.",
    );
  });

  it("lee el result de un arreglo o de líneas JSONL", () => {
    const result = { type: "result", is_error: false, structured_output: { title: "t", n: 1 } };
    const init = { type: "system", subtype: "init" };
    expect(parseClaudeResult(JSON.stringify([init, result]), Schema, "x").n).toBe(1);
    expect(
      parseClaudeResult(`${JSON.stringify(init)}\n${JSON.stringify(result)}\n`, Schema, "x").n,
    ).toBe(1);
  });
});

describe("smokeVerdict (AC-008)", () => {
  const init = (apiKeySource: unknown) =>
    JSON.stringify({ type: "system", subtype: "init", apiKeySource });
  const result = (structured_output?: unknown) =>
    JSON.stringify({ type: "result", subtype: "success", structured_output });

  it("pasa con apiKeySource none y structured_output", () => {
    expect(smokeVerdict(`${init("none")}\n${result({ a: 1 })}`)).toEqual({ ok: true, reasons: [] });
  });

  it("falla si apiKeySource no es none", () => {
    const v = smokeVerdict(`${init("ANTHROPIC_API_KEY")}\n${result({ a: 1 })}`);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain("apiKeySource");
  });

  it("falla si no hay evento init", () => {
    const v = smokeVerdict(result({ a: 1 }));
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain("apiKeySource");
  });

  it("falla sin structured_output", () => {
    const v = smokeVerdict(`${init("none")}\n${result()}`);
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain("structured_output");
  });

  it("falla con salida que no es JSON", () => {
    const v = smokeVerdict("basura");
    expect(v.ok).toBe(false);
    expect(v.reasons.join()).toContain("no es JSON");
  });
});

describe("buildClaudeStreamArgs (AC-002)", () => {
  const args = buildClaudeStreamArgs({ model: "modelo-x", system: "SISTEMA" });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  it("pide stream-json con mensajes parciales y effort high", () => {
    expect(args).toContain("-p");
    expect(after("--output-format")).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("--include-partial-messages");
    expect(after("--effort")).toBe("high");
    expect(after("--model")).toBe("modelo-x");
    expect(after("--system-prompt")).toBe("SISTEMA");
  });

  it("aísla la CLI: sin settings, sin herramientas, sin MCP ni sesión", () => {
    expect(after("--setting-sources")).toBe("");
    expect(after("--tools")).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
  });

  it("no pide salida estructurada", () => {
    expect(args).not.toContain("--json-schema");
  });
});

describe("parseStreamLine (REQ-001, REQ-004)", () => {
  const delta = (text: string) =>
    JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    });

  it("extrae el texto de un text_delta", () => {
    expect(parseStreamLine(delta("Hola"))).toEqual({ kind: "delta", text: "Hola" });
  });

  it("conserva un delta vacío y los saltos de línea tal cual", () => {
    expect(parseStreamLine(delta("a\nb"))).toEqual({ kind: "delta", text: "a\nb" });
    expect(parseStreamLine(delta(""))).toEqual({ kind: "delta", text: "" });
  });

  it("ignora otros eventos de stream, otros tipos de delta y líneas vacías o no JSON", () => {
    const other = (event: unknown) => JSON.stringify({ type: "stream_event", event });
    expect(parseStreamLine(other({ type: "message_start" }))).toEqual({ kind: "ignore" });
    expect(
      parseStreamLine(
        other({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: "x" } }),
      ),
    ).toEqual({ kind: "ignore" });
    expect(
      parseStreamLine(
        JSON.stringify({
          type: "assistant",
          event: { type: "content_block_delta", delta: { type: "text_delta", text: "x" } },
        }),
      ),
    ).toEqual({ kind: "ignore" });
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init" }))).toEqual({
      kind: "ignore",
    });
    expect(parseStreamLine("")).toEqual({ kind: "ignore" });
    expect(parseStreamLine("no es json")).toEqual({ kind: "ignore" });
    expect(parseStreamLine("null")).toEqual({ kind: "ignore" });
  });

  it("lee el result: éxito, is_error con detalle y stop_reason", () => {
    expect(
      parseStreamLine(JSON.stringify({ type: "result", subtype: "success", is_error: false })),
    ).toEqual({ kind: "result", failure: undefined });
    const failed = parseStreamLine(
      JSON.stringify({ type: "result", is_error: true, result: "se cayó" }),
    );
    expect(failed).toEqual({
      kind: "result",
      failure: new ClaudeCliError("failed", "Claude falló: se cayó"),
    });
    const noDetail = parseStreamLine(JSON.stringify({ type: "result", is_error: true }));
    expect(noDetail.kind === "result" && noDetail.failure?.message).toBe(
      "Claude falló: error sin detalle",
    );
    const cut = parseStreamLine(
      JSON.stringify({ type: "result", is_error: false, stop_reason: "max_tokens" }),
    );
    expect(cut.kind === "result" && cut.failure?.kind).toBe("truncated");
    const refused = parseStreamLine(
      JSON.stringify({ type: "result", is_error: false, stop_reason: "refusal" }),
    );
    expect(refused.kind === "result" && refused.failure?.kind).toBe("refused");
  });

  it("api_retry con authentication_failed o rate_limit es un fallo; otros se ignoran", () => {
    const retry = (error: unknown) =>
      parseStreamLine(JSON.stringify({ type: "system", subtype: "api_retry", error }));
    const auth = retry("authentication_failed");
    expect(auth.kind === "failure" && auth.failure.kind).toBe("auth");
    expect(auth.kind === "failure" && auth.failure.message).toContain("/login");
    const rate = retry("rate_limit");
    expect(rate.kind === "failure" && rate.failure.kind).toBe("rate-limit");
    expect(rate.kind === "failure" && rate.failure.message).toContain("límite");
    expect(retry("server_error")).toEqual({ kind: "ignore" });
    expect(
      parseStreamLine(JSON.stringify({ type: "system", subtype: "other", error: "rate_limit" })),
    ).toEqual({ kind: "ignore" });
  });
});

describe("notFoundError (REQ-004)", () => {
  it("nombra el binario y cómo arreglarlo", () => {
    const error = notFoundError("/x/claude");
    expect(error.kind).toBe("not-found");
    expect(error.message).toBe(
      "No se encontró el binario de Claude (/x/claude). Instala la CLI o define CLAUDE_BIN.",
    );
  });
});
