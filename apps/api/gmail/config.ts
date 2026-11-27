import { homedir } from "node:os";
import path from "node:path";
import { APP_ROOT } from "../paths.ts";

/** Únicos scopes que pide la app (C1, D8): enviar y leer; nunca `gmail.metadata`. */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  /** Carpeta del archivo de tokens, fuera del repo (D10). */
  tokenDir: string;
  /** Endpoints de Google; se reemplazan solo para apuntar a un Google falso en las pruebas. */
  authUrl?: string;
  tokenUrl?: string;
  apiRootUrl?: string;
}

/**
 * Carpeta de tokens: `APPLY_CONFIG_DIR` o `~/.config/apply`.
 * Falla si queda dentro del repo: un token nunca debe poder versionarse (REQ-004).
 */
export function resolveTokenDir(configured: string | undefined, home = homedir()): string {
  const dir = path.resolve(configured || path.join(home, ".config", "apply"));
  const relative = path.relative(APP_ROOT, dir);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`APPLY_CONFIG_DIR no puede quedar dentro del repo: ${dir}`);
  }
  return dir;
}

/** Configuración de Gmail desde el entorno; `null` si faltan las credenciales del cliente OAuth. */
export function readGmailConfig(env: NodeJS.ProcessEnv = process.env): GmailConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    tokenDir: resolveTokenDir(env.APPLY_CONFIG_DIR),
    authUrl: env.GOOGLE_OAUTH_AUTH_URL || undefined,
    tokenUrl: env.GOOGLE_OAUTH_TOKEN_URL || undefined,
    apiRootUrl: env.GMAIL_API_ROOT_URL || undefined,
  };
}
