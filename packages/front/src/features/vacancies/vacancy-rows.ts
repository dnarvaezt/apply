import type { CvMeta, Vacancy, VacancyStatus } from "@apply/shared";

export interface VacancyRow {
  vacancy: Vacancy;
  cvCount: number;
}

/** Cada vacante con la cantidad de CVs generados para ella. */
export function toVacancyRows(
  vacancies: Vacancy[],
  cvs: Pick<CvMeta, "vacancyId">[],
): VacancyRow[] {
  return vacancies.map((vacancy) => ({
    vacancy,
    cvCount: cvs.filter((c) => c.vacancyId === vacancy.id).length,
  }));
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Búsqueda en título y empresa, sin distinguir mayúsculas ni tildes. */
export function matchesSearch(row: VacancyRow, query: string): boolean {
  const q = fold(query);
  return fold(`${row.vacancy.title} ${row.vacancy.company}`).includes(q);
}

/** Filtro por estado del proceso; `""` deja pasar todas. */
export function matchesStatus(row: VacancyRow, status: VacancyStatus | ""): boolean {
  return status === "" || row.vacancy.status === status;
}
