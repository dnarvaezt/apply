import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { z } from "zod";
import {
  buildClaudeArgs,
  buildClaudeEnv,
  buildClaudeStreamArgs,
  buildImageInput,
  ClaudeCliError,
  type ClaudeImage,
  notFoundError,
  parseClaudeResult,
  parseStreamLine,
  readClaudeConfig,
  toClaudeJsonSchema,
} from "./cli.ts";

type RunInput = { bin: string; args: string[]; stdin: string; timeoutMs: number };

/** Ejecuta el binario en un directorio temporal vacío y devuelve su stdout; termina al hijo si vence el timeout. */
export async function runClaudeProcess(input: RunInput): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "apply-claude-"));
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(input.bin, input.args, {
        cwd,
        env: buildClaudeEnv(process.env),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.setEncoding("utf8").on("data", (c: string) => {
        stdout += c;
      });
      child.stderr.setEncoding("utf8").on("data", (c: string) => {
        stderr += c;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, input.timeoutMs);
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(error.code === "ENOENT" ? notFoundError(input.bin) : error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error(`Claude excedió el tiempo límite de ${input.timeoutMs} ms.`));
        } else if (code !== 0) {
          const detail = (stderr || stdout).trim().slice(0, 500);
          reject(new Error(`Claude terminó con código ${code}${detail ? `: ${detail}` : ""}`));
        } else {
          resolve(stdout);
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(input.stdin);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

/** Pide a `claude -p` una salida estructurada y la valida con `schema`. `what`: "la vacante", "el correo"... */
export async function runClaudeStructured<T>(input: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  what: string;
  /** Si viene, la entrada va por `stream-json` con el bloque de imagen y `prompt` como texto. */
  image?: ClaudeImage;
}): Promise<T> {
  const config = readClaudeConfig(process.env);
  const stdout = await runClaudeProcess({
    bin: config.bin,
    args: buildClaudeArgs({
      model: config.model,
      system: input.system,
      jsonSchema: toClaudeJsonSchema(input.schema),
      inputFormat: input.image ? "stream-json" : undefined,
    }),
    stdin: input.image ? buildImageInput(input.prompt, input.image) : input.prompt,
    timeoutMs: config.timeoutMs,
  });
  return parseClaudeResult(stdout, input.schema, input.what);
}

type StreamInput = RunInput & { signal?: AbortSignal };

/**
 * Ejecuta el binario en streaming y emite cada `text_delta`. SIGTERM al hijo si se aborta `signal`,
 * si el consumidor deja de iterar o si la CLI reporta autenticación/límite; SIGKILL al vencer el timeout.
 * Si se aborta, el generador termina sin error: quien aborta ya no espera el resultado.
 */
export async function* streamClaudeProcess(input: StreamInput): AsyncGenerator<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "apply-claude-"));
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  const child = spawn(input.bin, input.args, {
    cwd,
    env: buildClaudeEnv(process.env),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exit = new Promise<{ code: number | null; error?: NodeJS.ErrnoException }>((resolve) => {
    child.once("error", (error: NodeJS.ErrnoException) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });
  try {
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (c: string) => {
      stderr += c;
    });
    let timedOut = false;
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, input.timeoutMs);
    onAbort = () => child.kill("SIGTERM");
    if (input.signal?.aborted) onAbort();
    else input.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input.stdin);

    let sawText = false;
    let finished = false;
    for await (const line of createInterface({ input: child.stdout })) {
      const event = parseStreamLine(line);
      if (event.kind === "delta") {
        sawText = true;
        yield event.text;
      } else if (event.kind === "failure") {
        throw event.failure;
      } else if (event.kind === "result") {
        if (event.failure) throw event.failure;
        finished = true;
      }
    }
    const { code, error } = await exit;
    if (input.signal?.aborted) return;
    if (timedOut) {
      throw new ClaudeCliError(
        "timeout",
        `Claude excedió el tiempo límite de ${input.timeoutMs} ms.`,
      );
    }
    if (error) throw error.code === "ENOENT" ? notFoundError(input.bin) : error;
    if (code !== 0) {
      const detail = stderr.trim().slice(0, 500);
      throw new ClaudeCliError(
        "failed",
        `Claude terminó con código ${code}${detail ? `: ${detail}` : ""}`,
      );
    }
    if (!finished || !sawText) {
      throw new ClaudeCliError("failed", "Claude no devolvió texto para el CV.");
    }
  } finally {
    clearTimeout(timer);
    if (onAbort) input.signal?.removeEventListener("abort", onAbort);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exit;
    await rm(cwd, { recursive: true, force: true });
  }
}

/** Texto libre de `claude -p` en streaming, con el modelo y el timeout de la configuración. */
export function streamClaudeText(input: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const config = readClaudeConfig(process.env);
  return streamClaudeProcess({
    bin: config.bin,
    args: buildClaudeStreamArgs({ model: config.model, system: input.system }),
    stdin: input.prompt,
    timeoutMs: config.timeoutMs,
    signal: input.signal,
  });
}
