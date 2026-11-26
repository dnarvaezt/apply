import type { PostedAtPrecision } from "@apply/shared";
import { parseRelativeDate } from "./relative-date.ts";

export interface ResolvedPostedAt {
  postedAt: Date | null;
  precision: PostedAtPrecision;
}

/** Fuentes de la fecha de publicación, de mayor a menor prioridad. */
export interface PostedAtSources {
  /** Fecha escrita a mano; `null` = el usuario la borró; ausente = no la tocó. */
  manual?: Date | null;
  /** `datePosted` del JSON-LD `JobPosting`. */
  jsonLd?: string | null;
  /** Fecha tal como la leyó el LLM del texto pegado ("hace 3 días", "2026-03-01"). */
  extracted?: string | null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** `AAAA-MM-DD` (UTC) o ISO 8601 con hora y zona; cualquier otra cosa → `null`. */
export function parseAbsoluteDate(text: string): Date | null {
  const value = text.trim();
  const day = DATE_ONLY.exec(value);
  if (day) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return date.getUTCDate() === Number(day[3]) && date.getUTCMonth() + 1 === Number(day[2])
      ? date
      : null;
  }
  if (!DATE_TIME.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const UNKNOWN: ResolvedPostedAt = { postedAt: null, precision: "unknown" };

/**
 * Decide `posted_at` y su precisión: manual > JSON-LD > texto extraído. Una fecha completa es
 * `exact`; una relativa se calcula desde `createdAt` y queda `relative`; sin fecha, `unknown`.
 */
export function resolvePostedAt(sources: PostedAtSources, createdAt: Date): ResolvedPostedAt {
  if (sources.manual !== undefined) {
    return sources.manual ? { postedAt: sources.manual, precision: "exact" } : UNKNOWN;
  }
  const fromJsonLd = sources.jsonLd ? parseAbsoluteDate(sources.jsonLd) : null;
  if (fromJsonLd) return { postedAt: fromJsonLd, precision: "exact" };
  if (!sources.extracted) return UNKNOWN;
  const absolute = parseAbsoluteDate(sources.extracted);
  if (absolute) return { postedAt: absolute, precision: "exact" };
  const relative = parseRelativeDate(sources.extracted, createdAt);
  return relative ? { postedAt: relative, precision: "relative" } : UNKNOWN;
}
