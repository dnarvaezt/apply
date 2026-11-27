import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Ruta del binario `claude` falso (frontera externa, D9): nunca llama a Anthropic ni a la red. */
export const FAKE_CLAUDE_BIN = path.resolve(import.meta.dirname, "fake-claude.mjs");

export type FakeClaudeMode =
  | "error"
  | "no-structured"
  | "exit1"
  | "hang"
  | "blank-image"
  | "short-image"
  | "no-transcription";

/** Lo que "transcribe" el binario falso ante un bloque de imagen (con espacios, para probar el recorte). */
export const FAKE_TRANSCRIPTION =
  "  Transcripción falsa de la vacante: buscamos ingeniera backend con TypeScript y PostgreSQL para operar APIs.\n";

/**
 * Apunta `CLAUDE_BIN` al falso mientras dure la prueba. `outputs` mapea una propiedad del esquema
 * (p. ej. "subject") al `structured_output` que devuelve. `restore()` deja el env como estaba.
 */
export function useFakeClaude(outputs: Record<string, unknown>, mode?: FakeClaudeMode) {
  // Stryker copia el proyecto a un sandbox sin el bit de ejecución.
  chmodSync(FAKE_CLAUDE_BIN, 0o755);
  const dir = mkdtempSync(path.join(tmpdir(), "fake-claude-"));
  const captureFile = path.join(dir, "capture.json");
  const pidFile = path.join(dir, "pid");
  const keys = [
    "CLAUDE_BIN",
    "CLAUDE_MODEL",
    "CLAUDE_TIMEOUT_MS",
    "FAKE_CLAUDE_OUTPUTS",
    "FAKE_CLAUDE_MODE",
    "FAKE_CLAUDE_TRANSCRIPTION",
    "FAKE_CLAUDE_CAPTURE",
    "FAKE_CLAUDE_PID_FILE",
  ];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.CLAUDE_BIN = FAKE_CLAUDE_BIN;
  process.env.FAKE_CLAUDE_OUTPUTS = JSON.stringify(outputs);
  process.env.FAKE_CLAUDE_TRANSCRIPTION = FAKE_TRANSCRIPTION;
  process.env.FAKE_CLAUDE_CAPTURE = captureFile;
  process.env.FAKE_CLAUDE_PID_FILE = pidFile;
  if (mode) process.env.FAKE_CLAUDE_MODE = mode;
  else delete process.env.FAKE_CLAUDE_MODE;
  return {
    /** Si el binario falso llegó a ejecutarse. */
    invoked: () => existsSync(captureFile),
    /** Argumentos y stdin de la última invocación. */
    capture: () =>
      JSON.parse(readFileSync(captureFile, "utf8")) as { args: string[]; stdin: string },
    pid: () => Number(readFileSync(pidFile, "utf8")),
    restore() {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
