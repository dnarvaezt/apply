import type { Vacancy, VacancyChanges } from "@apply/shared";
import { type PosterFormValues, posterFormFrom, toManualFields } from "./poster-form";

/** Valores del formulario de edición de la vacante. */
export interface VacancyFormValues {
  title: string;
  company: string;
  location: string;
  seniority: string;
  summary: string;
  poster: PosterFormValues;
}

export function vacancyFormFrom(v: Vacancy): VacancyFormValues {
  return {
    title: v.title,
    company: v.company,
    location: v.location ?? "",
    seniority: v.seniority ?? "",
    summary: v.summary,
    poster: posterFormFrom(v),
  };
}

/** Lo que se envía al guardar: textos recortados; ubicación o seniority vacías se borran. */
export function toVacancyChanges(values: VacancyFormValues): VacancyChanges {
  return {
    title: values.title.trim(),
    company: values.company.trim(),
    location: values.location.trim() || null,
    seniority: values.seniority.trim() || null,
    summary: values.summary.trim(),
    ...toManualFields(values.poster),
  };
}

export type SourceMode = "text" | "url" | "image" | "browser";

export interface SourceInput {
  text: string;
  url: string;
  image: File | null;
}

/** Mínimo de caracteres de un texto pegado para que valga la pena analizarlo. */
const MIN_TEXT_LENGTH = 80;

const SOURCE_READY: Record<SourceMode, (input: SourceInput) => boolean> = {
  text: (i) => i.text.trim().length >= MIN_TEXT_LENGTH,
  url: (i) => i.url.trim() !== "",
  browser: (i) => i.url.trim() !== "",
  image: (i) => i.image !== null,
};

/** Si la fuente elegida tiene lo necesario para analizar la vacante. */
export function canSubmitSource(mode: SourceMode, input: SourceInput): boolean {
  return SOURCE_READY[mode](input);
}
