import { describe, expect, it } from "vitest";
import { parseAbsoluteDate, resolvePostedAt } from "./posted-at.ts";

const NOW = new Date("2026-03-15T12:00:00.000Z");
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("parseAbsoluteDate", () => {
  it.each([
    ["2026-03-10", "2026-03-10T00:00:00.000Z"],
    ["2026-03-10T08:30:00Z", "2026-03-10T08:30:00.000Z"],
    ["2026-03-10T08:30:00-05:00", "2026-03-10T13:30:00.000Z"],
    ["  2026-03-10  ", "2026-03-10T00:00:00.000Z"],
  ])("acepta %j", (text, expected) => {
    expect(iso(parseAbsoluteDate(text))).toBe(expected);
  });

  it.each(["", "hace 3 días", "2026-02-30", "2026-13-01", "10/03/2026", "2026-03-10Tbasura"])(
    "rechaza %j",
    (text) => {
      expect(parseAbsoluteDate(text)).toBeNull();
    },
  );
});

describe("resolvePostedAt (REQ-002..005)", () => {
  it("sin ninguna fuente queda NULL con precisión unknown (REQ-004)", () => {
    expect(resolvePostedAt({}, NOW)).toEqual({ postedAt: null, precision: "unknown" });
    expect(resolvePostedAt({ jsonLd: null, extracted: null }, NOW)).toEqual({
      postedAt: null,
      precision: "unknown",
    });
  });

  it("una fecha relativa extraída se calcula desde la creación (REQ-002)", () => {
    const r = resolvePostedAt({ extracted: "hace 3 días" }, NOW);
    expect(r.precision).toBe("relative");
    expect(iso(r.postedAt)).toBe("2026-03-12T12:00:00.000Z");
  });

  it("una fecha completa extraída es exacta", () => {
    const r = resolvePostedAt({ extracted: "2026-03-01" }, NOW);
    expect(r).toEqual({ postedAt: new Date("2026-03-01T00:00:00.000Z"), precision: "exact" });
  });

  it("un texto extraído que no es fecha queda unknown", () => {
    expect(resolvePostedAt({ extracted: "pronto" }, NOW)).toEqual({
      postedAt: null,
      precision: "unknown",
    });
  });

  it("datePosted del JSON-LD es exacto y gana al texto extraído (REQ-003)", () => {
    const r = resolvePostedAt({ jsonLd: "2026-02-20", extracted: "hace 3 días" }, NOW);
    expect(r).toEqual({ postedAt: new Date("2026-02-20T00:00:00.000Z"), precision: "exact" });
  });

  it("un datePosted inválido cae al texto extraído", () => {
    const r = resolvePostedAt({ jsonLd: "ayer no", extracted: "hace 1 día" }, NOW);
    expect(r.precision).toBe("relative");
    expect(iso(r.postedAt)).toBe("2026-03-14T12:00:00.000Z");
  });

  it("la fecha manual prevalece y es exacta (REQ-005)", () => {
    const manual = new Date("2026-01-05T00:00:00.000Z");
    expect(
      resolvePostedAt({ manual, jsonLd: "2026-02-20", extracted: "hace 3 días" }, NOW),
    ).toEqual({ postedAt: manual, precision: "exact" });
  });

  it("borrar la fecha a mano deja NULL/unknown aunque haya extraída", () => {
    expect(resolvePostedAt({ manual: null, extracted: "hace 3 días" }, NOW)).toEqual({
      postedAt: null,
      precision: "unknown",
    });
  });
});
