/** Origen que se guarda en `vacancies.source`: imagen, URL o texto pegado. */
export function vacancySource(input: {
  fromImage?: boolean;
  sourceUrl: string | null;
}): "image" | "url" | "text" {
  if (input.fromImage) return "image";
  return input.sourceUrl ? "url" : "text";
}
