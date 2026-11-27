import { describe, expect, it } from "vitest";
import {
  calibrate,
  formatCalibration,
  hitTable,
  type LabeledScore,
  labeledScores,
  parseSample,
} from "./calibrate.ts";

const CURRENT = { strong: 0.88, partial: 0.835 };

describe("hitTable", () => {
  it("cuenta por nivel esperado cuántos requisitos aciertan con los umbrales dados", () => {
    const samples: LabeledScore[] = [
      { score: 0.9, expected: "fuerte" },
      { score: 0.85, expected: "fuerte" },
      { score: 0.85, expected: "parcial" },
      { score: 0.835, expected: "parcial" },
      { score: 0.8, expected: "débil" },
      { score: 0.88, expected: "débil" },
    ];
    expect(hitTable(samples, CURRENT)).toEqual({
      fuerte: { total: 2, hits: 1 },
      parcial: { total: 2, hits: 2 },
      débil: { total: 2, hits: 1 },
      all: { total: 6, hits: 4 },
    });
  });

  it("sin muestras deja todo en cero", () => {
    expect(hitTable([], CURRENT).all).toEqual({ total: 0, hits: 0 });
  });
});

describe("calibrate", () => {
  it("elige los umbrales que más aciertan y muestra el antes y el después (REQ-001)", () => {
    // Los CV condensados puntúan más bajo: los umbrales del perfil fallan fuerte y parcial.
    const samples: LabeledScore[] = [
      { score: 0.86, expected: "fuerte" },
      { score: 0.87, expected: "fuerte" },
      { score: 0.83, expected: "parcial" },
      { score: 0.82, expected: "parcial" },
      { score: 0.79, expected: "débil" },
      { score: 0.8, expected: "débil" },
    ];
    const result = calibrate(samples, CURRENT);
    expect(result.before.all).toEqual({ total: 6, hits: 2 });
    expect(result.after.all).toEqual({ total: 6, hits: 6 });
    expect(result.thresholds.strong).toBeGreaterThan(0.83);
    expect(result.thresholds.strong).toBeLessThanOrEqual(0.86);
    expect(result.thresholds.partial).toBeGreaterThan(0.8);
    expect(result.thresholds.partial).toBeLessThanOrEqual(0.82);
  });

  it("si los umbrales actuales ya aciertan todo, los conserva", () => {
    const samples: LabeledScore[] = [
      { score: 0.95, expected: "fuerte" },
      { score: 0.86, expected: "parcial" },
      { score: 0.5, expected: "débil" },
    ];
    expect(calibrate(samples, CURRENT).thresholds).toEqual(CURRENT);
  });

  it("entre umbrales con los mismos aciertos elige el más cercano a los actuales", () => {
    const samples: LabeledScore[] = [
      { score: 0.99, expected: "fuerte" },
      { score: 0.6, expected: "parcial" },
      { score: 0.1, expected: "débil" },
    ];
    expect(calibrate(samples, CURRENT).thresholds).toEqual({ strong: 0.88, partial: 0.6 });
  });

  it("puede dejar parcial vacío o fuerte por encima de toda la muestra", () => {
    const allWeak: LabeledScore[] = [
      { score: 0.9, expected: "débil" },
      { score: 0.95, expected: "débil" },
    ];
    const result = calibrate(allWeak, CURRENT);
    expect(result.after.all.hits).toBe(2);
    // El corte queda apenas sobre el mayor puntaje, no en un valor arbitrario.
    expect(result.thresholds).toEqual({ strong: 0.951, partial: 0.951 });
  });

  it("parcial nunca queda por encima de fuerte", () => {
    const samples: LabeledScore[] = [
      { score: 0.8, expected: "fuerte" },
      { score: 0.5, expected: "débil" },
    ];
    expect(calibrate(samples, CURRENT).thresholds).toEqual({ strong: 0.8, partial: 0.8 });
  });

  it("a igualdad de aciertos también acerca parcial al vigente", () => {
    // Ningún corte acierta los cuatro: 0.76 y 0.8 aciertan tres; 0.8 está más cerca de 0.835.
    const samples: LabeledScore[] = [
      { score: 0.95, expected: "fuerte" },
      { score: 0.8, expected: "parcial" },
      { score: 0.78, expected: "débil" },
      { score: 0.76, expected: "parcial" },
    ];
    expect(calibrate(samples, CURRENT).thresholds).toEqual({ strong: 0.88, partial: 0.8 });
  });

  it("rechaza una muestra vacía: no hay con qué calibrar", () => {
    expect(() => calibrate([], CURRENT)).toThrow(/muestra/);
  });
});

describe("parseSample", () => {
  const sample = {
    cv: "# CV",
    vacancy: { mustHave: ["Node.js"], niceToHave: ["Go"], keywords: ["Node.js"] },
    expected: [
      { requirement: "Node.js", level: "fuerte" },
      { requirement: "Go", level: "débil" },
    ],
  };

  it("acepta un par CV-vacante etiquetado", () => {
    expect(parseSample(sample)).toEqual(sample);
  });

  it("rechaza una etiqueta de un requisito que la vacante no tiene", () => {
    const bad = { ...sample, expected: [{ requirement: "Rust", level: "fuerte" }] };
    expect(() => parseSample(bad)).toThrow(/Rust/);
  });

  it("rechaza un nivel que no existe", () => {
    const bad = { ...sample, expected: [{ requirement: "Go", level: "alto" }] };
    expect(() => parseSample(bad)).toThrow();
  });
});

describe("labeledScores", () => {
  it("une el puntaje de cada requisito etiquetado con su nivel esperado", () => {
    const requirements = [
      { requirement: "Node.js", score: 0.9 },
      { requirement: "Go", score: 0.7 },
      { requirement: "Sin etiqueta", score: 0.8 },
    ];
    const expected = [
      { requirement: "Go", level: "débil" as const },
      { requirement: "Node.js", level: "fuerte" as const },
    ];
    expect(labeledScores(requirements, expected)).toEqual([
      { score: 0.7, expected: "débil" },
      { score: 0.9, expected: "fuerte" },
    ]);
  });

  it("falla si un requisito etiquetado no tiene puntaje", () => {
    expect(() => labeledScores([], [{ requirement: "Go", level: "débil" }])).toThrow(/Go/);
  });
});

describe("formatCalibration", () => {
  it("muestra aciertos antes y después por nivel y los umbrales de cada lado", () => {
    const samples: LabeledScore[] = [
      { score: 0.86, expected: "fuerte" },
      { score: 0.82, expected: "parcial" },
      { score: 0.5, expected: "débil" },
    ];
    expect(formatCalibration(calibrate(samples, CURRENT), CURRENT)).toBe(
      [
        "| Nivel esperado | Actual | Propuesto |",
        "| --- | --- | --- |",
        "| Umbrales | fuerte ≥ 0.88, parcial ≥ 0.835 | fuerte ≥ 0.86, parcial ≥ 0.82 |",
        "| fuerte | 0/1 | 1/1 |",
        "| parcial | 0/1 | 1/1 |",
        "| débil | 1/1 | 1/1 |",
        "| Total | 1/3 (33 %) | 3/3 (100 %) |",
      ].join("\n"),
    );
  });

  it("un nivel sin casos se muestra sin porcentaje", () => {
    const text = formatCalibration(
      calibrate([{ score: 0.5, expected: "débil" }], CURRENT),
      CURRENT,
    );
    expect(text).toContain("| fuerte | 0/0 | 0/0 |");
  });
});
