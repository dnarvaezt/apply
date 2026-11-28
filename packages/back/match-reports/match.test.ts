import { describe, expect, it } from "vitest";
import type { Chunk } from "../rag/chunk.ts";
import { MATCH_WEIGHTS, PARTIAL, STRONG, weightedCoverage } from "../rag/match.ts";
import { buildCvMatch, EVIDENCE_CHARS, evidenceText, keywordCoverage } from "./match.ts";

describe("keywordCoverage (AC-001)", () => {
  it("Java no coincide dentro de JavaScript", () => {
    const r = keywordCoverage(["Java"], "Experiencia con JavaScript y TypeScript.");
    expect(r).toEqual({ found: [], missing: ["Java"], coverage: 0 });
  });

  it("node.js coincide sin distinguir mayúsculas", () => {
    const r = keywordCoverage(["node.js"], "APIs en Node.JS y Postgres");
    expect(r).toEqual({ found: ["node.js"], missing: [], coverage: 1 });
  });

  it("lista las faltantes y calcula la fracción encontrada", () => {
    const r = keywordCoverage(
      ["TypeScript", "Kubernetes", "SQL", "Go"],
      "TypeScript, SQL y Python",
    );
    expect(r.found).toEqual(["TypeScript", "SQL"]);
    expect(r.missing).toEqual(["Kubernetes", "Go"]);
    expect(r.coverage).toBe(0.5);
  });

  it("respeta límites de palabra con símbolos (c++, c#, .net) y al inicio o final del texto", () => {
    expect(keywordCoverage(["c++"], "c++ y rust").found).toEqual(["c++"]);
    expect(keywordCoverage(["c"], "c++ y rust").found).toEqual([]);
    expect(keywordCoverage(["C#"], "uso .NET y C#").found).toEqual(["C#"]);
    expect(keywordCoverage([".NET"], "uso .NET y C#").found).toEqual([".NET"]);
    expect(keywordCoverage(["sql"], "postgresql").found).toEqual([]);
    expect(keywordCoverage(["sql"], "sql")).toEqual({ found: ["sql"], missing: [], coverage: 1 });
  });

  it("no distingue tildes y trata la keyword como texto literal, no como regex", () => {
    expect(keywordCoverage(["gestión"], "Gestion de equipos").found).toEqual(["gestión"]);
    expect(keywordCoverage(["a.b"], "axb").found).toEqual([]);
  });

  it("deduplica keywords repetidas sin distinguir mayúsculas y descarta las vacías", () => {
    const r = keywordCoverage(["SQL", "sql", "  ", "Go"], "sql");
    expect(r).toEqual({ found: ["SQL"], missing: ["Go"], coverage: 0.5 });
  });

  it("reporta cada keyword sin los espacios que traiga la vacante", () => {
    const r = keywordCoverage([" SQL ", "Go\n"], "sql");
    expect(r).toEqual({ found: ["SQL"], missing: ["Go"], coverage: 0.5 });
  });

  it("sin keywords la cobertura es 1", () => {
    expect(keywordCoverage([], "lo que sea")).toEqual({ found: [], missing: [], coverage: 1 });
  });

  it("redondea la fracción a 3 decimales", () => {
    expect(keywordCoverage(["a1", "b1", "c1"], "a1").coverage).toBe(0.333);
  });
});

describe("weightedCoverage (AC-002)", () => {
  it("2 fuertes + 1 parcial + 1 débil de 4 mustHave = 0.625", () => {
    expect(weightedCoverage(["fuerte", "fuerte", "parcial", "débil"])).toBe(0.625);
  });

  it("usa fuerte = 1, parcial = 0.5 y débil = 0", () => {
    expect(MATCH_WEIGHTS).toEqual({ fuerte: 1, parcial: 0.5, débil: 0 });
    expect(weightedCoverage(["parcial"])).toBe(0.5);
    expect(weightedCoverage(["débil"])).toBe(0);
  });

  it("sin mustHave la cobertura es 1", () => {
    expect(weightedCoverage([])).toBe(1);
  });
});

describe("evidenceText", () => {
  it("deja el texto corto igual y recorta el largo con elipsis", () => {
    expect(evidenceText("  breve  ")).toBe("breve");
    const long = "x".repeat(EVIDENCE_CHARS + 10);
    const out = evidenceText(long);
    expect(out).toHaveLength(EVIDENCE_CHARS + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(evidenceText("y".repeat(EVIDENCE_CHARS))).toBe("y".repeat(EVIDENCE_CHARS));
  });
});

/** Vectores unitarios: el coseno de `at(x)` con `q` es `x`; `none` es ortogonal a todos. */
const at = (x: number) => [x, Math.sqrt(1 - x * x), 0];
const q = [1, 0, 0];
const none = [0, 0, 1];

const chunks: Chunk[] = [
  { id: "cv#0", file: "cv", heading: "Ana > Resumen", text: "TypeScript y Postgres" },
  { id: "cv#1", file: "cv", heading: "Ana > Experiencia", text: "APIs REST" },
];

describe("buildCvMatch", () => {
  const vacancy = {
    mustHave: ["TypeScript", "Kubernetes"],
    niceToHave: ["Docker"],
    keywords: ["typescript", "go"],
  };

  it("da nivel, puntaje y evidencia del mejor fragmento del CV por requisito", () => {
    const passages = [at(0.95), at(0.5)];
    const r = buildCvMatch(vacancy, chunks, passages, [q, none, q]);
    expect(r.requirements).toHaveLength(3);
    expect(r.requirements.map((x) => x.kind)).toEqual(["must", "must", "nice"]);
    expect(r.requirements[0]).toMatchObject({
      requirement: "TypeScript",
      level: "fuerte",
      evidence: { heading: "Ana > Resumen", text: "TypeScript y Postgres" },
    });
    expect(r.requirements[0].score).toBeGreaterThanOrEqual(STRONG);
    // `none` es ortogonal a los dos fragmentos: Kubernetes queda débil y sin evidencia
    expect(r.requirements[1]).toMatchObject({ requirement: "Kubernetes", level: "débil" });
    expect(r.requirements[2]).toMatchObject({ requirement: "Docker", level: "fuerte" });
  });

  it("un requisito débil no lleva evidencia y la cobertura pondera solo mustHave", () => {
    const passages = [at(0.5), at(0.4)];
    const r = buildCvMatch(
      { mustHave: ["Kubernetes"], niceToHave: [], keywords: [] },
      chunks,
      passages,
      [q],
    );
    expect(r.requirements[0]).toMatchObject({ level: "débil", evidence: null });
    expect(r.coverage).toBe(0);
  });

  it("calcula la cobertura con los niveles de mustHave e ignora niceToHave", () => {
    const passages = [at(0.99), at(0.1)];
    const r = buildCvMatch(
      { mustHave: ["A", "B"], niceToHave: ["C"], keywords: [] },
      chunks,
      passages,
      [q, none, q],
    );
    expect(r.requirements.map((x) => x.level)).toEqual(["fuerte", "débil", "fuerte"]);
    expect(r.coverage).toBe(0.5);
  });

  it("un nivel parcial cuenta 0.5", () => {
    const passages = [at(PARTIAL + 0.01)];
    const r = buildCvMatch(
      { mustHave: ["Algo raro"], niceToHave: [], keywords: [] },
      chunks.slice(0, 1),
      passages,
      [q],
    );
    expect(r.requirements[0].level).toBe("parcial");
    expect(r.requirements[0].evidence).not.toBeNull();
    expect(r.coverage).toBe(0.5);
  });

  it("sin fragmentos en el CV todo es débil, con puntaje 0", () => {
    const r = buildCvMatch(vacancy, [], [], [q, q, q]);
    expect(r.requirements.every((x) => x.level === "débil" && x.score === 0 && !x.evidence)).toBe(
      true,
    );
    expect(r.coverage).toBe(0);
  });

  it("mide las keywords sobre encabezados y texto de todos los fragmentos", () => {
    const r = buildCvMatch(vacancy, chunks, [at(0.5), at(0.5)], [q, q, q]);
    expect(r.keywords).toEqual({ found: ["typescript"], missing: ["go"], coverage: 0.5 });
    const byHeading = buildCvMatch(
      { mustHave: [], niceToHave: [], keywords: ["experiencia"] },
      chunks,
      [at(0.5), at(0.5)],
      [],
    );
    expect(byHeading.keywords.found).toEqual(["experiencia"]);
  });

  it("es determinista: dos cálculos del mismo par dan el mismo informe (AC-004)", () => {
    const run = () => buildCvMatch(vacancy, chunks, [at(0.9), at(0.86)], [q, none, q]);
    expect(run()).toEqual(run());
  });

  it("falla si la cantidad de vectores no coincide con fragmentos o requisitos", () => {
    expect(() => buildCvMatch(vacancy, chunks, [at(0.5)], [q, q, q])).toThrow(/vectores/);
    expect(() => buildCvMatch(vacancy, chunks, [at(0.5), at(0.5)], [q])).toThrow(/vectores/);
  });
});
