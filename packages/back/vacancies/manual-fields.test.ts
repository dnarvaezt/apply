import { describe, expect, it } from "vitest";
import { parseManualFields } from "./manual-fields.ts";

const ok = (input: unknown) => {
  const r = parseManualFields(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("parseManualFields (REQ-005, REQ-007)", () => {
  it("acepta el objeto vacío y deja todo sin tocar", () => {
    expect(ok({})).toEqual({});
  });

  it("recorta textos y conserva solo los campos enviados", () => {
    expect(
      ok({
        posterName: "  Ana Pérez ",
        posterTitle: " Recruiter",
        posterProfileUrl: " https://www.linkedin.com/in/ana ",
      }),
    ).toEqual({
      posterName: "Ana Pérez",
      posterTitle: "Recruiter",
      posterProfileUrl: "https://www.linkedin.com/in/ana",
    });
  });

  it("cadena vacía o null limpian el campo", () => {
    expect(
      ok({ posterName: "", posterTitle: "   ", posterProfileUrl: null, postedAt: "" }),
    ).toEqual({ posterName: null, posterTitle: null, posterProfileUrl: null, postedAt: null });
  });

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>1</script>",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "mailto:a@b.com",
    "no es una url",
    "//example.com/x",
  ])("rechaza posterProfileUrl %s", (url) => {
    const r = parseManualFields({ posterProfileUrl: url });
    expect(r).toEqual({ ok: false, error: "posterProfileUrl debe ser una URL http o https" });
  });

  it("acepta http y https", () => {
    expect(ok({ posterProfileUrl: "http://example.com/p" }).posterProfileUrl).toBe(
      "http://example.com/p",
    );
  });

  it("acepta fecha completa YYYY-MM-DD y ISO", () => {
    expect(ok({ postedAt: "2026-03-01" }).postedAt?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(ok({ postedAt: "2026-03-01T10:30:00Z" }).postedAt?.toISOString()).toBe(
      "2026-03-01T10:30:00.000Z",
    );
  });

  it.each(["ayer", "2026-13-40", "2026-02-30", "01/03/2026", "2026-03"])(
    "rechaza postedAt %s",
    (value) => {
      expect(parseManualFields({ postedAt: value })).toEqual({
        ok: false,
        error: "postedAt debe ser una fecha válida (AAAA-MM-DD)",
      });
    },
  );

  it("rechaza tipos incorrectos y textos demasiado largos", () => {
    expect(parseManualFields({ posterName: 5 }).ok).toBe(false);
    expect(parseManualFields({ posterName: "a".repeat(201) }).ok).toBe(false);
    expect(parseManualFields({ posterName: "a".repeat(200) }).ok).toBe(true);
    expect(parseManualFields("texto").ok).toBe(false);
    expect(parseManualFields(null).ok).toBe(false);
  });
});
