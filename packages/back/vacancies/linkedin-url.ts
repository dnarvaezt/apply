/**
 * Una búsqueda o colección de LinkedIn muestra la vacante elegida (`currentJobId`) junto a una lista:
 * se lee y se guarda la vista propia de esa vacante, sin parámetros de seguimiento.
 */
export function canonicalVacancyUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const linkedIn = parsed.hostname === "linkedin.com" || parsed.hostname.endsWith(".linkedin.com");
  const jobId = parsed.searchParams.get("currentJobId");
  if (!linkedIn || !jobId || !/^\d+$/.test(jobId)) return url;
  return `https://www.linkedin.com/jobs/view/${jobId}/`;
}
