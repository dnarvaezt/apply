/** Plataformas sembradas en la tabla `platforms` (migración 0004). */
export type PlatformSlug = "linkedin" | "manual";

function isLinkedInHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

/**
 * `linkedin` si la URL es de LinkedIn o el texto pegado lo menciona; si no, `manual`.
 * Solo clasifica: nunca descarga nada.
 */
export function detectPlatform(sourceUrl: string | null, rawText: string): PlatformSlug {
  if (sourceUrl) {
    try {
      if (isLinkedInHost(new URL(sourceUrl).hostname)) return "linkedin";
    } catch {
      // URL inválida: se decide por el texto
    }
  }
  return /linkedin/i.test(rawText) ? "linkedin" : "manual";
}
