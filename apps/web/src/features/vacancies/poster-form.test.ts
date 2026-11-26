import type { Vacancy } from "@apply/shared";
import { describe, expect, it } from "vitest";
import {
  describePostedAt,
  EMPTY_POSTER_FORM,
  posterFormFrom,
  toCreateFields,
  toManualFields,
} from "./poster-form.ts";

const vacancy = (over: Partial<Vacancy>) =>
  ({
    posterName: null,
    posterTitle: null,
    posterProfileUrl: null,
    postedAt: null,
    postedAtPrecision: "unknown",
    ...over,
  }) as Vacancy;

describe("poster-form", () => {
  it("rellena el formulario desde la vacante", () => {
    expect(
      posterFormFrom(
        vacancy({
          posterName: "Ana",
          posterTitle: "Recruiter",
          posterProfileUrl: "https://x.com/a",
          postedAt: "2026-03-12T12:00:00.000Z",
        }),
      ),
    ).toEqual({
      posterName: "Ana",
      posterTitle: "Recruiter",
      posterProfileUrl: "https://x.com/a",
      postedAt: "2026-03-12",
    });
    expect(posterFormFrom(vacancy({}))).toEqual(EMPTY_POSTER_FORM);
  });

  it("al editar recorta y convierte vacíos en null", () => {
    expect(
      toManualFields({
        posterName: " Ana ",
        posterTitle: "  ",
        posterProfileUrl: "",
        postedAt: "2026-03-01",
      }),
    ).toEqual({
      posterName: "Ana",
      posterTitle: null,
      posterProfileUrl: null,
      postedAt: "2026-03-01",
    });
  });

  it("al crear omite los vacíos", () => {
    expect(toCreateFields(EMPTY_POSTER_FORM)).toEqual({});
    expect(toCreateFields({ ...EMPTY_POSTER_FORM, posterName: " Ana " })).toEqual({
      posterName: "Ana",
    });
  });

  it("describe la fecha según su precisión", () => {
    expect(describePostedAt({ postedAt: null, postedAtPrecision: "unknown" })).toBe(
      "Fecha de publicación desconocida",
    );
    expect(
      describePostedAt({ postedAt: "2026-03-12T23:00:00.000Z", postedAtPrecision: "relative" }),
    ).toBe("Publicada el 12/3/2026 (aprox.)");
    expect(
      describePostedAt({ postedAt: "2026-03-01T00:00:00.000Z", postedAtPrecision: "exact" }),
    ).toBe("Publicada el 1/3/2026");
  });
});
