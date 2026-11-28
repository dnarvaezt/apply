import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startEphemeralPostgres } from "../../packages/back/db/test/ephemeral-postgres.ts";
import { startFakeGoogle } from "../../packages/back/test/fake-google.ts";
import { E2E_DB_URL_FILE } from "./db-url.ts";
import { FAKE_CLAUDE_ENV } from "./fake-claude.ts";

/**
 * Backend del E2E, un solo proceso para que Playwright lo arranque y lo apague:
 *  - Postgres efímero (Testcontainers) con migraciones; nunca la base `apply` de desarrollo.
 *  - `claude` falso (`CLAUDE_BIN`) para extraer la vacante, redactar el correo y generar el CV en streaming.
 *  - Google falso (OAuth + Gmail) y un `APPLY_CONFIG_DIR` temporal fuera del repo: nunca toca
 *    la cuenta ni los tokens reales del usuario.
 *  - La API real apuntando a ellos.
 * Variables: PORT (API), E2E_GOOGLE_PORT (Google falso),
 * CV_DATA_DIR (perfil temporal).
 * La URL de la base queda en `E2E_DB_URL_FILE` para los specs que corren comandos contra ella.
 */

const apiPort = process.env.PORT ?? "3101";
const googlePort = Number(process.env.E2E_GOOGLE_PORT ?? Number(apiPort) + 2000);

const postgres = await startEphemeralPostgres();
mkdirSync(path.dirname(E2E_DB_URL_FILE), { recursive: true });
writeFileSync(E2E_DB_URL_FILE, postgres.url, "utf8");
const google = await startFakeGoogle(googlePort);
const gmailConfigDir = path.join(tmpdir(), `apply-e2e-gmail-${apiPort}`);
rmSync(gmailConfigDir, { recursive: true, force: true });

const api: ChildProcess = spawn("npm", ["run", "start", "-w", "@apply/back"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: apiPort,
    DATABASE_URL: postgres.url,
    ...FAKE_CLAUDE_ENV,
    GOOGLE_CLIENT_ID: "e2e-cliente.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "e2e-secreto-falso",
    GOOGLE_OAUTH_AUTH_URL: google.authUrl,
    GOOGLE_OAUTH_TOKEN_URL: google.tokenUrl,
    GMAIL_API_ROOT_URL: google.url,
    APPLY_CONFIG_DIR: gmailConfigDir,
  },
});

let closing = false;
async function shutdown(code: number): Promise<never> {
  if (!closing) {
    closing = true;
    api.kill("SIGTERM");
    await google.close().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
  }
  process.exit(code);
}

api.on("exit", (code) => void shutdown(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(0));
}
