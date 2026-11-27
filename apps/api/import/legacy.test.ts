import { describe, expect, it } from "vitest";
import {
  type LegacyVacancy,
  legacyVacancyToNew,
  parseLegacyCvMeta,
  parseLegacyVacancy,
} from "./legacy.ts";

const VACANCY: LegacyVacancy = {
  id: "2026-05-01-acme-backend-ab12cd",
  createdAt: "2026-05-01T10:00:00.000Z",
  sourceUrl: null,
  rawText: "Buscamos backend con TypeScript.",
  title: "Backend Engineer",
  company: "ACME",
  location: "Remoto",
  seniority: "senior",
  language: "es",
  summary: "Backend en pagos.",
  mustHave: ["TypeScript"],
  niceToHave: ["Go"],
  responsibilities: ["Diseñar APIs"],
  keywords: ["node"],
};

const CV_META = {
  id: "2026-05-02-acme-ef34gh",
  vacancyId: "2026-05-01-acme-backend-ab12cd",
  title: "CV ACME",
  createdAt: "2026-05-02T09:00:00.000Z",
  updatedAt: "2026-05-03T09:00:00.000Z",
};

describe("parseLegacyVacancy", () => {
  it("acepta la vacante tal como la escribía la versión en archivos", () => {
    expect(parseLegacyVacancy(JSON.stringify(VACANCY))).toEqual(VACANCY);
  });

  it("rechaza un JSON mal formado con un mensaje de JSON inválido", () => {
    expect(() => parseLegacyVacancy("{ no es json")).toThrow(/JSON inválido/);
  });

  it("rechaza una vacante sin título y nombra el campo", () => {
    const { title: _title, ...sinTitulo } = VACANCY;
    expect(() => parseLegacyVacancy(JSON.stringify(sinTitulo))).toThrow(/title/);
  });

  it("rechaza un id vacío, una fecha inválida y un idioma desconocido", () => {
    for (const bad of [
      { ...VACANCY, id: "" },
      { ...VACANCY, createdAt: "ayer" },
      { ...VACANCY, language: "fr" },
    ]) {
      expect(() => parseLegacyVacancy(JSON.stringify(bad))).toThrow();
    }
  });
});

describe("parseLegacyCvMeta", () => {
  it("acepta los metadatos del CV, con o sin vacante", () => {
    expect(parseLegacyCvMeta(JSON.stringify(CV_META))).toEqual(CV_META);
    const huerfano = { ...CV_META, vacancyId: null };
    expect(parseLegacyCvMeta(JSON.stringify(huerfano))).toEqual(huerfano);
  });

  it("rechaza un JSON mal formado y unos metadatos sin fecha de edición", () => {
    expect(() => parseLegacyCvMeta("[")).toThrow(/JSON inválido/);
    const { updatedAt: _u, ...sinFecha } = CV_META;
    expect(() => parseLegacyCvMeta(JSON.stringify(sinFecha))).toThrow(/updatedAt/);
  });
});

describe("legacyVacancyToNew", () => {
  it("conserva el id viejo y la fecha, y deja sin publicador ni fecha de publicación", () => {
    const { legacyId, createdAt, input } = legacyVacancyToNew(VACANCY);
    expect(legacyId).toBe(VACANCY.id);
    expect(createdAt).toEqual(new Date(VACANCY.createdAt));
    expect(input).toEqual({
      sourceUrl: null,
      rawText: VACANCY.rawText,
      title: VACANCY.title,
      company: VACANCY.company,
      location: VACANCY.location,
      seniority: VACANCY.seniority,
      language: "es",
      summary: VACANCY.summary,
      mustHave: VACANCY.mustHave,
      niceToHave: VACANCY.niceToHave,
      responsibilities: VACANCY.responsibilities,
      keywords: VACANCY.keywords,
      platform: "manual",
      posterName: null,
      posterTitle: null,
      posterProfileUrl: null,
      postedAt: null,
      postedAtPrecision: "unknown",
    });
  });

  it("detecta la plataforma desde la URL de origen", () => {
    const linkedin = { ...VACANCY, sourceUrl: "https://www.linkedin.com/jobs/view/1" };
    expect(legacyVacancyToNew(linkedin).input.platform).toBe("linkedin");
  });
});
