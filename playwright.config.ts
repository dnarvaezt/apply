import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const API_PORT = 3101;
const WEB_PORT = 5174;
const E2E_DATA_DIR = "node_modules/.tmp/e2e-data";

// Chrome/Chromium del host (misma idea que CHROME_CANDIDATES de server/pdf.ts);
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
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    launchOptions: hostChrome ? { executablePath: hostChrome } : {},
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // API con un directorio de datos temporal: nunca lee ni escribe `data/` del usuario.
      // Sin ANTHROPIC_API_KEY: el flujo de humo no llama a Anthropic.
      command: `rm -rf ${E2E_DATA_DIR} && tsx server/index.ts`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        PORT: String(API_PORT),
        CV_DATA_DIR: E2E_DATA_DIR,
        ANTHROPIC_API_KEY: "e2e-no-llamar",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
