import path from "node:path";

/** Raíz del repo, derivada de la ubicación de este archivo (apps/api), nunca de `process.cwd()`. */
export const APP_ROOT = path.resolve(import.meta.dirname, "../..");

export const ENV_FILE = path.join(APP_ROOT, ".env");
export const MODELS_DIR = path.join(APP_ROOT, ".cache", "models");
export const CV_THEME_CSS = path.join(APP_ROOT, "packages", "shared", "cv-theme.css");

/** `CV_DATA_DIR` relativo se resuelve contra la raíz del repo; por defecto `data/` en la raíz. */
export function resolveDataDir(configured: string | undefined): string {
  return path.resolve(APP_ROOT, configured ?? "data");
}
