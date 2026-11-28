import type { Vacancy } from "@apply/shared";

type Language = Vacancy["language"];

const NAMED: Record<Language, string> = { es: "Hola", en: "Hi" };
const GENERIC: Record<Language, string> = { es: "Hola,", en: "Hello," };

/** Saludo determinista: el modelo no lo escribe, así nunca inventa ni cambia el nombre del poster. */
export function greeting(language: Language, posterName: string | null): string {
  const firstName = posterName?.trim().split(/\s/)[0];
  return firstName ? `${NAMED[language]} ${firstName},` : GENERIC[language];
}

export function composeBody(language: Language, posterName: string | null, body: string): string {
  return `${greeting(language, posterName)}\n\n${body.trim()}`;
}

const EMAIL = /[\w.%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

/** Primer email publicado en el texto de la vacante; `null` si no hay (C7). */
export function recipientFromText(text: string): string | null {
  return text.match(EMAIL)?.[0] ?? null;
}

/**
 * `undefined`: el usuario no lo indicó y se toma de la vacante. Vacío o `null`: falta a propósito.
 * Lo demás ya llega validado como email.
 */
export function resolveRecipient(
  to: string | null | undefined,
  vacancyText: string,
): string | null {
  if (to === undefined) return recipientFromText(vacancyText);
  return to || null;
}
