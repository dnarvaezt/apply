import { describe, expect, it } from "vitest";
import { vacancy } from "./fixtures.ts";
import { canSubmitSource, toVacancyChanges, vacancyFormFrom } from "./vacancy-form.ts";

describe("vacancy-form (#73)", () => {
  it("rellena el formulario desde la vacante y devuelve los cambios recortados", () => {
    const form = vacancyFormFrom(
      vacancy({ location: null, posterName: "Ana", postedAt: "2026-03-12T12:00:00.000Z" }),
    );
    expect(form).toMatchObject({
      title: "Ingeniera Backend",
      company: "ACME",
      location: "",
      seniority: "Senior",
      summary: "Construir APIs.",
      poster: { posterName: "Ana", postedAt: "2026-03-12" },
    });
    expect(
      toVacancyChanges({ ...form, title: " Lead ", location: " ", summary: " Nuevo " }),
    ).toEqual({
      title: "Lead",
      company: "ACME",
      location: null,
      seniority: "Senior",
      summary: "Nuevo",
      posterName: "Ana",
      posterTitle: null,
      posterProfileUrl: null,
      postedAt: "2026-03-12",
    });
  });

  it.each([
    ["text", { text: "a".repeat(79) }, false],
    ["text", { text: "a".repeat(80) }, true],
    ["url", { url: " " }, false],
    ["url", { url: "https://x.co" }, true],
    ["browser", { url: "https://x.co" }, true],
    ["image", { image: null }, false],
    ["image", { image: new File(["x"], "v.png") }, true],
  ] as const)("canSubmitSource %s %o → %s", (mode, input, expected) => {
    expect(canSubmitSource(mode, { text: "", url: "", image: null, ...input })).toBe(expected);
  });
});
