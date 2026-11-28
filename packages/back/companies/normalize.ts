/**
 * Clave de deduplicación de empresas: sin acentos, en minúsculas y sin puntuación.
 * "ACME S.A." y "acme sa" dan la misma clave.
 */
export function normalizeCompanyName(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return key || name.trim().toLowerCase();
}
