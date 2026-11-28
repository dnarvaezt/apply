import { z } from "zod";
import { buildClaudeArgs, readClaudeConfig, smokeVerdict, toClaudeJsonSchema } from "./cli.ts";
import { runClaudeProcess } from "./runner.ts";

/**
 * Smoke manual opt-in contra el `claude` real: `npm run claude:smoke`. Fuera de `npm test` y del e2e.
 * Sale con exit 1 si `apiKeySource` no es "none" o si falta `structured_output`.
 */
const Schema = z.object({ title: z.string(), company: z.string() });

const config = readClaudeConfig(process.env);
const stdout = await runClaudeProcess({
  bin: config.bin,
  args: buildClaudeArgs({
    model: config.model,
    system: "Extraes título y empresa de una oferta de empleo. Sé fiel al texto.",
    jsonSchema: toClaudeJsonSchema(Schema),
    outputFormat: "stream-json",
  }),
  stdin: "<vacante>\nBackend Engineer en ACME. Requisitos: TypeScript.\n</vacante>",
  timeoutMs: config.timeoutMs,
});
const verdict = smokeVerdict(stdout);
if (verdict.ok) {
  console.log("claude:smoke OK (apiKeySource none, structured_output presente)");
} else {
  console.error(`claude:smoke FALLÓ: ${verdict.reasons.join("; ")}`);
  process.exit(1);
}
