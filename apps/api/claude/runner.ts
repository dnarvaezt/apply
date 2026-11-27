import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { z } from "zod";
import {
  buildClaudeArgs,
  buildClaudeEnv,
  parseClaudeResult,
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
        reject(
          error.code === "ENOENT"
            ? new Error(
                `No se encontró el binario de Claude (${input.bin}). Instala la CLI o define CLAUDE_BIN.`,
              )
            : error,
        );
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
}): Promise<T> {
  const config = readClaudeConfig(process.env);
  const stdout = await runClaudeProcess({
    bin: config.bin,
    args: buildClaudeArgs({
      model: config.model,
      system: input.system,
      jsonSchema: toClaudeJsonSchema(input.schema),
    }),
    stdin: input.prompt,
    timeoutMs: config.timeoutMs,
  });
  return parseClaudeResult(stdout, input.schema, input.what);
}
