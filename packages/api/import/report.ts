export interface Tally {
  imported: number;
  skipped: number;
}

export interface ImportReport {
  vacancies: Tally;
  cvs: Tally;
  profile: { chunks: number };
  /** Ruta relativa a `data/` y motivo. */
  errors: { file: string; message: string }[];
}

/** Resumen que imprime `npm run db:import` (REQ-006). */
export function formatReport(report: ImportReport): string {
  const { vacancies, cvs, profile, errors } = report;
  return [
    `Vacantes: ${vacancies.imported} importadas, ${vacancies.skipped} omitidas`,
    `CVs: ${cvs.imported} importados, ${cvs.skipped} omitidos`,
    `Fragmentos del perfil: ${profile.chunks}`,
    `Errores: ${errors.length}`,
    ...errors.map((e) => `  - ${e.file}: ${e.message}`),
  ].join("\n");
}

/** Distinto de 0 si algún archivo no se pudo importar. */
export const exitCode = (report: ImportReport): number => (report.errors.length > 0 ? 1 : 0);
