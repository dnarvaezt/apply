import type { Vacancy, VacancyManualFields } from "@apply/shared";

/** Valores del formulario de poster y fecha; `postedAt` en AAAA-MM-DD (input `date`). */
export interface PosterFormValues {
  posterName: string;
  posterTitle: string;
  posterProfileUrl: string;
  postedAt: string;
}

export const EMPTY_POSTER_FORM: PosterFormValues = {
  posterName: "",
  posterTitle: "",
  posterProfileUrl: "",
  postedAt: "",
};

export function posterFormFrom(v: Vacancy): PosterFormValues {
  return {
    posterName: v.posterName ?? "",
    posterTitle: v.posterTitle ?? "",
    posterProfileUrl: v.posterProfileUrl ?? "",
    postedAt: v.postedAt ? v.postedAt.slice(0, 10) : "",
  };
}

/** Al editar, un campo vacío se envía como `null` (lo borra). */
export function toManualFields(values: PosterFormValues): VacancyManualFields {
  const clean = (s: string) => s.trim() || null;
  return {
    posterName: clean(values.posterName),
    posterTitle: clean(values.posterTitle),
    posterProfileUrl: clean(values.posterProfileUrl),
    postedAt: clean(values.postedAt),
  };
}

/** Al crear, solo se envían los campos escritos: los vacíos dejan lo que extraiga Claude. */
export function toCreateFields(values: PosterFormValues): VacancyManualFields {
  return Object.fromEntries(
    Object.entries(toManualFields(values)).filter(([, v]) => v !== null),
  ) as VacancyManualFields;
}

const PRECISION_LABEL: Record<Vacancy["postedAtPrecision"], string> = {
  exact: "",
  relative: " (aprox.)",
  unknown: "",
};

/** "Publicada el 12/3/2026 (aprox.)" o "Fecha de publicación desconocida". */
export function describePostedAt(v: Pick<Vacancy, "postedAt" | "postedAtPrecision">): string {
  if (!v.postedAt) return "Fecha de publicación desconocida";
  const day = new Date(v.postedAt).toLocaleDateString("es", { timeZone: "UTC" });
  return `Publicada el ${day}${PRECISION_LABEL[v.postedAtPrecision]}`;
}
