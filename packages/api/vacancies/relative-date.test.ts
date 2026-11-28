import { describe, expect, it } from "vitest";
import { parseRelativeDate } from "./relative-date.ts";

/** Fecha de referencia fija: la de creación de la vacante. */
const NOW = new Date("2026-03-15T12:00:00.000Z");
const iso = (text: string) => parseRelativeDate(text, NOW)?.toISOString() ?? null;

describe("parseRelativeDate (AC-002)", () => {
  it.each([
    ["hace 3 días", "2026-03-12T12:00:00.000Z"],
    ["Publicado hace 1 día", "2026-03-14T12:00:00.000Z"],
    ["hace un día", "2026-03-14T12:00:00.000Z"],
    ["hace 2 semanas", "2026-03-01T12:00:00.000Z"],
    ["hace una semana", "2026-03-08T12:00:00.000Z"],
    ["hace 2 meses", "2026-01-15T12:00:00.000Z"],
    ["hace un mes", "2026-02-15T12:00:00.000Z"],
    ["hace 1 año", "2025-03-15T12:00:00.000Z"],
    ["hace 2 años", "2024-03-15T12:00:00.000Z"],
    ["hace 5 horas", "2026-03-15T07:00:00.000Z"],
    ["hace una hora", "2026-03-15T11:00:00.000Z"],
    ["hace 30 minutos", "2026-03-15T11:30:00.000Z"],
    ["hace 10 segundos", NOW.toISOString()],
    ["ayer", "2026-03-14T12:00:00.000Z"],
    ["Hoy", NOW.toISOString()],
    ["hace un momento", NOW.toISOString()],
  ])("español: %s", (text, expected) => {
    expect(iso(text)).toBe(expected);
  });

  it.each([
    ["3 days ago", "2026-03-12T12:00:00.000Z"],
    ["Reposted 2 weeks ago", "2026-03-01T12:00:00.000Z"],
    ["a day ago", "2026-03-14T12:00:00.000Z"],
    ["1 day ago", "2026-03-14T12:00:00.000Z"],
    ["an hour ago", "2026-03-15T11:00:00.000Z"],
    ["5 hours ago", "2026-03-15T07:00:00.000Z"],
    ["a week ago", "2026-03-08T12:00:00.000Z"],
    ["a month ago", "2026-02-15T12:00:00.000Z"],
    ["3 months ago", "2025-12-15T12:00:00.000Z"],
    ["2 years ago", "2024-03-15T12:00:00.000Z"],
    ["45 minutes ago", "2026-03-15T11:15:00.000Z"],
    ["yesterday", "2026-03-14T12:00:00.000Z"],
    ["today", NOW.toISOString()],
    ["just now", NOW.toISOString()],
    ["30 seconds ago", NOW.toISOString()],
  ])("inglés: %s", (text, expected) => {
    expect(iso(text)).toBe(expected);
  });

  it("recorta el día al fin de un mes más corto", () => {
    expect(
      parseRelativeDate("hace 1 mes", new Date("2026-03-31T00:00:00.000Z"))?.toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z");
  });

  it.each(["", "   ", "pronto", "hace mucho tiempo", "next week", "3 days"])(
    "devuelve null si no es una fecha relativa: %j",
    (text) => {
      expect(parseRelativeDate(text, NOW)).toBeNull();
    },
  );

  it("no cambia la fecha de referencia", () => {
    const now = new Date(NOW);
    parseRelativeDate("hace 2 meses", now);
    expect(now.toISOString()).toBe(NOW.toISOString());
  });
});
