import { existsSync } from "node:fs";

const CHROME_CANDIDATES = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/brave",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

/** Chrome/Chromium local: `CHROME_PATH` primero, luego las rutas habituales. Lo usan el PDF y el MCP de Chrome. */
export function findChromePath(env: NodeJS.ProcessEnv = process.env): string {
  const path = [env.CHROME_PATH, ...CHROME_CANDIDATES].find((p) => p && existsSync(p));
  if (!path) throw new Error("No se encontró Chrome/Chromium. Define CHROME_PATH en .env");
  return path;
}
