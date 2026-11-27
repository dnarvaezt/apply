#!/usr/bin/env node
// Binario `claude` falso para la suite y el e2e: nunca llama a Anthropic ni a la red.
// Valida solo dos cosas: que el env no trae ninguna ANTHROPIC_* y que el `$schema` es draft-07.
// Entorno de control:
//   FAKE_CLAUDE_OUTPUTS   JSON { "<propiedad>": <structured_output> }; se elige la entrada cuya
//                         propiedad aparece en `properties` del esquema recibido.
//   FAKE_CLAUDE_MODE      error | no-structured | exit1 | hang (default: éxito) y, solo si la entrada
//                         trae un bloque de imagen: blank-image (transcription vacía) | short-image
//                         (transcription de pocos caracteres) | no-transcription (sin el campo).
//   FAKE_CLAUDE_TRANSCRIPTION  texto que "transcribe" ante un bloque de imagen.
//   FAKE_CLAUDE_CAPTURE   archivo donde guarda { args, stdin } de la invocación.
//   FAKE_CLAUDE_PID_FILE  archivo donde guarda su pid (para comprobar que el timeout lo mata).
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const { FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_CAPTURE, FAKE_CLAUDE_PID_FILE } = process.env;

if (FAKE_CLAUDE_PID_FILE) writeFileSync(FAKE_CLAUDE_PID_FILE, String(process.pid));

const stdin = await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => {
    data += c;
  });
  process.stdin.on("end", () => resolve(data));
});
if (FAKE_CLAUDE_CAPTURE) writeFileSync(FAKE_CLAUDE_CAPTURE, JSON.stringify({ args, stdin }));

const leaked = Object.keys(process.env).filter((k) => k.startsWith("ANTHROPIC_"));
if (leaked.length > 0) {
  console.error(`fake-claude: el env trae ${leaked.join(", ")}`);
  process.exit(1);
}

const schemaText = args[args.indexOf("--json-schema") + 1] ?? "{}";
let schema;
try {
  schema = JSON.parse(schemaText);
} catch {
  schema = {};
}
// `--input-format stream-json` exige también la salida stream-json, como la CLI real.
const inputFormat = args[args.indexOf("--input-format") + 1];
const outputFormat = args[args.indexOf("--output-format") + 1];
if (
  args.includes("--input-format") &&
  (inputFormat !== "stream-json" || outputFormat !== "stream-json")
) {
  console.error("Error: --input-format=stream-json requires --output-format=stream-json");
  process.exit(1);
}
const hasImage = stdin
  .split("\n")
  .filter(Boolean)
  .some((line) => {
    try {
      const content = JSON.parse(line)?.message?.content;
      return Array.isArray(content) && content.some((block) => block?.type === "image");
    } catch {
      return false;
    }
  });
const transcription =
  mode === "blank-image"
    ? ""
    : mode === "short-image"
      ? "poco"
      : (process.env.FAKE_CLAUDE_TRANSCRIPTION ??
        "Transcripción falsa de la vacante: buscamos ingeniera backend con TypeScript y PostgreSQL para operar APIs.");

if (schema.$schema !== "http://json-schema.org/draft-07/schema#") {
  console.error("Error: --json-schema is not a valid JSON Schema");
  process.exit(1);
}

if (mode === "exit1") {
  console.error("fake-claude: fallo simulado");
  process.exit(1);
}
if (mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  const result = (extra) => ({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "ok",
    ...extra,
  });
  const outputs = JSON.parse(process.env.FAKE_CLAUDE_OUTPUTS ?? "{}");
  const key = Object.keys(outputs).find((k) => k in (schema.properties ?? {}));
  const body =
    mode === "error"
      ? result({ subtype: "error_during_execution", is_error: true, result: "fallo simulado" })
      : mode === "no-structured" || key === undefined
        ? result()
        : result({
            structured_output:
              hasImage &&
              "transcription" in (schema.properties ?? {}) &&
              mode !== "no-transcription"
                ? { ...outputs[key], transcription }
                : outputs[key],
          });
  process.stdout.write(`${JSON.stringify(body)}\n`);
}
