import { describe, expect, it } from "vitest";
import { exitCode, formatReport, type ImportReport } from "./report.ts";

const clean: ImportReport = {
  vacancies: { imported: 2, skipped: 1 },
  cvs: { imported: 3, skipped: 0 },
  profile: { chunks: 7 },
  errors: [],
};

describe("formatReport", () => {
  it("imprime importados, omitidos, fragmentos y errores en líneas fijas", () => {
    expect(formatReport(clean)).toBe(
      [
        "Vacantes: 2 importadas, 1 omitidas",
        "CVs: 3 importados, 0 omitidos",
        "Fragmentos del perfil: 7",
        "Errores: 0",
      ].join("\n"),
    );
  });

  it("lista cada archivo con error y su motivo", () => {
    const report = {
      ...clean,
      errors: [
        { file: "vacancies/rota.json", message: "JSON inválido" },
        { file: "cvs/x.json", message: "falta x.md" },
      ],
    };
    expect(formatReport(report).split("\n").slice(3)).toEqual([
      "Errores: 2",
      "  - vacancies/rota.json: JSON inválido",
      "  - cvs/x.json: falta x.md",
    ]);
  });
});

describe("exitCode", () => {
  it("sale con 0 sin errores y con 1 si hubo alguno", () => {
    expect(exitCode(clean)).toBe(0);
    expect(exitCode({ ...clean, errors: [{ file: "a.json", message: "x" }] })).toBe(1);
  });
});
