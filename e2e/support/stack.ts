import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startEphemeralPostgres } from "../../packages/db/test/ephemeral-postgres.ts";
import { E2E_DB_URL_FILE } from "./db-url.ts";
import { startFakeAnthropic } from "./fake-anthropic.ts";

/**
 * Backend del E2E, un solo proceso para que Playwright lo arranque y lo apague:
 *  - Postgres efímero (Testcontainers) con migraciones; nunca la base `apply` de desarrollo.
 *  - Anthropic falso en la frontera HTTP (`ANTHROPIC_BASE_URL`).
 *  - La API real apuntando a ambos.
 * Variables: PORT (API), E2E_LLM_PORT (Anthropic falso), CV_DATA_DIR (perfil temporal).
 * La URL de la base queda en `E2E_DB_URL_FILE` para los specs que corren comandos contra ella.
 */

const apiPort = process.env.PORT ?? "3101";
const llmPort = Number(process.env.E2E_LLM_PORT ?? Number(apiPort) + 1000);

const postgres = await startEphemeralPostgres();
mkdirSync(path.dirname(E2E_DB_URL_FILE), { recursive: true });
writeFileSync(E2E_DB_URL_FILE, postgres.url, "utf8");
const llm = await startFakeAnthropic(llmPort);

const api: ChildProcess = spawn("npm", ["run", "start", "-w", "@apply/api"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: apiPort,
    DATABASE_URL: postgres.url,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${llmPort}`,
    ANTHROPIC_API_KEY: "e2e-clave-falsa",
  },
});

let closing = false;
async function shutdown(code: number): Promise<never> {
  if (!closing) {
    closing = true;
    api.kill("SIGTERM");
    llm.close();
    await postgres.stop().catch(() => undefined);
  }
  process.exit(code);
}

api.on("exit", (code) => void shutdown(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(0));
}
