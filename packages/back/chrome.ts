import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
  const found = [env.CHROME_PATH, ...CHROME_CANDIDATES].find((p) => p && existsSync(p));
  if (!found) throw new Error("No se encontró Chrome/Chromium. Define CHROME_PATH en .env");
  return found;
}

/** Carpeta de datos del Chrome estable del usuario en Linux; CHROME_USER_DATA_DIR la cambia. */
export function chromeUserDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CHROME_USER_DATA_DIR?.trim() || path.join(homedir(), ".config", "google-chrome");
}

/** Chrome escribe DevToolsActivePort mientras tiene la depuración remota activada (chrome://inspect). */
export function chromeAcceptsDebugging(userDataDir: string): boolean {
  return existsSync(path.join(userDataDir, "DevToolsActivePort"));
}
