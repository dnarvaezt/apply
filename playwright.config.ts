import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Puertos por entorno para que dos worktrees corran `npm run e2e` a la vez.
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const GOOGLE_PORT = API_PORT + 2000; // Google falso: el spec de #22 le inyecta respuestas
const E2E_DATA_DIR = "node_modules/.tmp/e2e-data";

// Chrome/Chromium del host (misma idea que CHROME_CANDIDATES de packages/back/pdf.ts);
// si no hay ninguno, Playwright usa su propio Chromium (`npx playwright install chromium`).
const hostChrome = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p): p is string => Boolean(p) && existsSync(p as string));

export default defineConfig({
  testDir: "e2e",
  outputDir: "reports/playwright/results",
  reporter: [["list"], ["html", { outputFolder: "reports/playwright/html", open: "never" }]],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000, // la primera generación indexa el perfil y descarga el modelo de embeddings
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    launchOptions: hostChrome ? { executablePath: hostChrome } : {},
    trace: "retain-on-failure",
  },
  // Las postulaciones no se pueden borrar (eventos append-only) y retienen su vacante, así que sus
  // specs corren después de los que esperan la base vacía (AC-006 de vacancies-cvs).
  projects: [
    {
      name: "ui",
      testIgnore: /(applications(-view)?|email-send|reply-detection|metrics|import-data)\.spec\.ts/,
    },
    {
      name: "applications",
      testMatch: /(applications(-view)?|email-send|reply-detection|metrics)\.spec\.ts/,
      dependencies: ["ui"],
    },
    // La importación reemplaza el índice del perfil por el del fixture: corre al final.
    { name: "import", testMatch: /import-data\.spec\.ts/, dependencies: ["applications"] },
  ],
  webServer: [
    {
      // Postgres efímero + claude falso + API real (ver e2e/support/stack.ts).
      // Directorio de datos temporal: nunca lee ni escribe `data/` del usuario.
      command: `rm -rf ${E2E_DATA_DIR} && npx tsx e2e/support/stack.ts`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        E2E_GOOGLE_PORT: String(GOOGLE_PORT),
        CV_DATA_DIR: E2E_DATA_DIR, // relativo: la api lo ancla a la raíz del repo
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      reuseExistingServer: false,
      timeout: 240_000, // incluye arrancar el contenedor y, la primera vez, bajar el modelo de embeddings
    },
    {
      command: `npm run dev -w @apply/front -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
