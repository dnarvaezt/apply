type Unit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

const UNIT_MS = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
} as const;

const UNIT_WORDS: Record<string, Unit> = {
  segundo: "second",
  minuto: "minute",
  hora: "hour",
  dia: "day",
  semana: "week",
  mes: "month",
  meses: "month",
  ano: "year",
  second: "second",
  minute: "minute",
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
};

const ES =
  /\bhace\s+(un|una|\d+)\s+(segundos?|minutos?|horas?|d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)\b/i;
const EN = /\b(an?|\d+)\s+(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b/i;
const NOW_WORDS = new Set(["hoy", "today", "hace un momento", "just now", "ahora", "now"]);
const YESTERDAY_WORDS = new Set(["ayer", "yesterday"]);

function normalizeUnit(word: string): Unit {
  const key = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const unit = UNIT_WORDS[key] ?? UNIT_WORDS[key.replace(/s$/, "")];
  return unit as Unit;
}

function subtractMonths(now: Date, months: number): Date {
  const result = new Date(now);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Convierte una fecha relativa en español o inglés ("hace 3 días", "2 weeks ago", "ayer") en la
 * fecha absoluta contando hacia atrás desde `now`. Devuelve `null` si el texto no es relativo.
 */
export function parseRelativeDate(text: string, now: Date): Date | null {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  if (NOW_WORDS.has(clean)) return new Date(now);
  if (YESTERDAY_WORDS.has(clean)) return new Date(now.getTime() - UNIT_MS.day);

  const match = ES.exec(text) ?? EN.exec(text);
  if (!match) return null;
  const [, amountWord, unitWord] = match as unknown as [string, string, string];
  const amount = /^\d+$/.test(amountWord) ? Number(amountWord) : 1;
  const unit = normalizeUnit(unitWord);
  // "hace 10 segundos" es "ahora" para una fecha de publicación.
  if (unit === "second") return new Date(now);
  if (unit === "month") return subtractMonths(now, amount);
  if (unit === "year") return subtractMonths(now, amount * 12);
  return new Date(now.getTime() - amount * UNIT_MS[unit]);
}
