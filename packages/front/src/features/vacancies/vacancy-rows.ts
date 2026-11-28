import type { Application, CvMeta, Vacancy } from "@apply/shared";
import { currentApplication } from "../applications/pipeline";

export interface VacancyRow {
  vacancy: Vacancy;
  /** La postulación vigente de la vacante; `null` si aún no se postuló. */
  application: Application | null;
  cvCount: number;
}

/** Cada vacante con su postulación vigente y la cantidad de CVs generados para ella. */
export function toVacancyRows(
  vacancies: Vacancy[],
  applications: Application[],
  cvs: Pick<CvMeta, "vacancyId">[],
): VacancyRow[] {
  return vacancies.map((vacancy) => ({
    vacancy,
    application: currentApplication(applications.filter((a) => a.vacancyId === vacancy.id)),
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
