import type { Vacancy } from "@apply/shared";
import { describe, expect, it } from "vitest";
import {
  buildMatchReport,
  fromContent,
  isStale,
  level,
  lexical,
  PARTIAL,
  rankChunks,
  STRONG,
  toContent,
  vacancyQueries,
} from "./match.ts";

const chunk = (file: string, i: number, heading = "H", text = "t") => ({
  id: `${file}#${i}`,
  file,
  heading,
  text,
});

describe("level", () => {
  it("respeta los umbrales STRONG y PARTIAL sin cambiar sus valores", () => {
    expect(STRONG).toBe(0.88);
    expect(PARTIAL).toBe(0.835);
    expect(level(STRONG)).toBe("fuerte");
    expect(level(0.95)).toBe("fuerte");
    expect(level(STRONG - 0.0001)).toBe("parcial");
    expect(level(PARTIAL)).toBe("parcial");
    expect(level(PARTIAL - 0.0001)).toBe("débil");
  });
});

describe("lexical", () => {
  it("cuenta la fracción de términos (>= 3 letras) presentes sin tildes ni mayúsculas", () => {
    expect(lexical("TypeScript y Node", "uso typescript a diario")).toBe(0.5);
    expect(lexical("Gestión", "gestion de equipos")).toBe(1);
    expect(lexical("C# .NET", "c# y .net")).toBe(1);
  });

  it("devuelve 0 si la consulta no tiene términos útiles", () => {
    expect(lexical("a y o", "a y o")).toBe(0);
    expect(lexical("", "algo")).toBe(0);
  });

  it("parte por separadores pero conserva +, #, . y dígitos", () => {
    expect(lexical("c++/go1.2", "c++ go1.2")).toBe(1);
    expect(lexical("rust-java", "java")).toBe(0.5);
    expect(lexical("api--sql", "api")).toBe(0.5);
  });

  it("acepta términos de exactamente 3 letras", () => {
    expect(lexical("sql", "uso sql")).toBe(1);
  });
});

describe("toContent / fromContent", () => {
  it("guarda encabezado y texto en una sola columna y los recupera", () => {
    const content = toContent({ heading: "Experiencia > ACME", text: "línea 1\nlínea 2" });
    expect(content).toBe("Experiencia > ACME\nlínea 1\nlínea 2");
    expect(fromContent(content)).toEqual({
      heading: "Experiencia > ACME",
      text: "línea 1\nlínea 2",
    });
  });

  it("tolera contenido sin salto de línea", () => {
    expect(fromContent("solo")).toEqual({ heading: "solo", text: "" });
  });
});

describe("isStale", () => {
  const current = new Map([
    ["a.md", "h1"],
    ["b.md", "h2"],
  ]);
  const stored = [
    { path: "a.md", hash: "h1", model: "m" },
    { path: "b.md", hash: "h2", model: "m" },
  ];

  it("está al día si coinciden archivos, hashes y modelo", () => {
    expect(isStale(current, stored, "m")).toBe(false);
  });

  it("vacío contra vacío no está desactualizado", () => {
    expect(isStale(new Map(), [], "m")).toBe(false);
  });

  it("detecta otro modelo, archivo cambiado, agregado o borrado", () => {
    expect(isStale(current, stored, "otro")).toBe(true);
    expect(isStale(new Map([...current, ["b.md", "x"]]), stored, "m")).toBe(true);
    expect(isStale(new Map([...current, ["c.md", "h3"]]), stored, "m")).toBe(true);
    expect(isStale(new Map([["a.md", "h1"]]), stored, "m")).toBe(true);
    expect(isStale(current, [stored[0]], "m")).toBe(true);
  });

  it("detecta un modelo distinto en una sola fila", () => {
    expect(isStale(current, [stored[0], { ...stored[1], model: "viejo" }], "m")).toBe(true);
  });
});

describe("vacancyQueries", () => {
  it("arma consultas obligatorias, deseables, responsabilidades y título+resumen", () => {
    const v = {
      title: "Dev",
      summary: "APIs",
      mustHave: ["TS"],
      niceToHave: ["Go"],
      responsibilities: ["Diseñar"],
    } as Vacancy;
    expect(vacancyQueries(v)).toEqual([
      { text: "TS", kind: "must" },
      { text: "Go", kind: "nice" },
      { text: "Diseñar", kind: "other" },
      { text: "Dev. APIs", kind: "other" },
    ]);
  });
});

describe("rankChunks", () => {
  it("suma 0.06 por coincidencia léxica completa y ordena de mayor a menor", () => {
    const ranked = rankChunks("kubernetes", [
      { chunk: chunk("a.md", 0, "Infra", "kubernetes"), sem: 0.8 },
      { chunk: chunk("b.md", 0, "Otro", "nada"), sem: 0.85 },
    ]);
    expect(ranked.map((r) => r.c.id)).toEqual(["a.md#0", "b.md#0"]);
    expect(ranked[0].score).toBeCloseTo(0.86, 10);
    expect(ranked[1].score).toBe(0.85);
  });

  it("busca el término también en el encabezado", () => {
    const [r] = rankChunks("kubernetes", [
      { chunk: chunk("a.md", 0, "Kubernetes", "x"), sem: 0.5 },
    ]);
    expect(r.score).toBeCloseTo(0.56, 10);
  });

  it("ordena aunque los candidatos lleguen en otro orden", () => {
    const ranked = rankChunks("nada", [
      { chunk: chunk("a.md", 0), sem: 0.5 },
      { chunk: chunk("b.md", 0), sem: 0.9 },
      { chunk: chunk("c.md", 0), sem: 0.7 },
    ]);
    expect(ranked.map((r) => r.c.id)).toEqual(["b.md#0", "c.md#0", "a.md#0"]);
  });
});

describe("buildMatchReport", () => {
  const strong = chunk("10-exp.md", 0, "Exp", "fuerte");
  const partial = chunk("10-exp.md", 1, "Exp", "parcial");
  const weak = chunk("20-otros.md", 0, "Otros", "débil");
  const always = chunk("00-contacto.md", 0, "Contacto", "mail");

  it("asigna niveles, evidencia, cobertura y contexto como el índice en JSON", () => {
    const report = buildMatchReport(
      "7",
      [
        { text: "req fuerte", kind: "must" },
        { text: "req parcial", kind: "must" },
        { text: "req débil", kind: "nice" },
        { text: "título", kind: "other" },
      ],
      [
        [
          { c: strong, score: 0.9 },
          { c: partial, score: 0.7 },
        ],
        [{ c: partial, score: 0.84 }],
        [{ c: weak, score: 0.5 }],
        [{ c: strong, score: 0.95 }],
      ],
      [always, strong],
    );

    expect(report.vacancyId).toBe("7");
    expect(report.coverage).toBe(0.75);
    expect(report.requirements).toEqual([
      {
        requirement: "req fuerte",
        kind: "must",
        score: 0.9,
        level: "fuerte",
        evidence: { file: "10-exp.md", heading: "Exp" },
      },
      {
        requirement: "req parcial",
        kind: "must",
        score: 0.84,
        level: "parcial",
        evidence: { file: "10-exp.md", heading: "Exp" },
      },
      { requirement: "req débil", kind: "nice", score: 0.5, level: "débil", evidence: null },
    ]);
    expect(report.chunks).toEqual([
      {
        id: "00-contacto.md#0",
        file: "00-contacto.md",
        heading: "Contacto",
        text: "mail",
        score: 1,
      },
      { id: "10-exp.md#0", file: "10-exp.md", heading: "Exp", text: "fuerte", score: 0.95 },
      { id: "10-exp.md#1", file: "10-exp.md", heading: "Exp", text: "parcial", score: 0.84 },
      { id: "20-otros.md#0", file: "20-otros.md", heading: "Otros", text: "débil", score: 0.5 },
    ]);
  });

  it("toma solo los 3 mejores por consulta y redondea a 3 decimales", () => {
    const cs = [0, 1, 2, 3].map((i) => chunk("x.md", i));
    const report = buildMatchReport(
      "1",
      [{ text: "q", kind: "nice" }],
      [cs.map((c, i) => ({ c, score: 0.91234 - i * 0.01 }))],
      [],
    );
    expect(report.chunks.map((c) => c.id)).toEqual(["x.md#0", "x.md#1", "x.md#2"]);
    expect(report.requirements[0].score).toBe(0.912);
    expect(report.coverage).toBe(1);
  });

  it("limita el contexto a 30 fragmentos", () => {
    const cs = Array.from({ length: 40 }, (_, i) => chunk("y.md", i));
    const queries = cs.map(() => ({ text: "q", kind: "other" as const }));
    const report = buildMatchReport(
      "1",
      queries,
      cs.map((c, i) => [{ c, score: 1 - i / 100 }]),
      [],
    );
    expect(report.chunks).toHaveLength(30);
    expect(report.chunks[0].id).toBe("y.md#0");
    expect(report.requirements).toEqual([]);
  });

  it("sin candidatos el requisito es débil con score 0 y la cobertura es 0", () => {
    const report = buildMatchReport("1", [{ text: "q", kind: "must" }], [[]], []);
    expect(report.requirements).toEqual([
      { requirement: "q", kind: "must", score: 0, level: "débil", evidence: null },
    ]);
    expect(report.coverage).toBe(0);
  });

  it("conserva el mejor puntaje de un fragmento entre consultas", () => {
    const report = buildMatchReport(
      "1",
      [
        { text: "a", kind: "other" },
        { text: "b", kind: "other" },
      ],
      [[{ c: strong, score: 0.6 }], [{ c: strong, score: 0.8 }]],
      [],
    );
    expect(report.chunks).toEqual([{ ...strong, score: 0.8 }]);
  });

  it("no rebaja el puntaje de un fragmento si otra consulta lo puntúa peor o igual", () => {
    const report = buildMatchReport(
      "1",
      [
        { text: "a", kind: "other" },
        { text: "b", kind: "other" },
        { text: "c", kind: "other" },
      ],
      [[{ c: strong, score: 0.8 }], [{ c: strong, score: 0.6 }], [{ c: weak, score: 0.7 }]],
      [],
    );
    expect(report.chunks.map((c) => [c.id, c.score])).toEqual([
      [strong.id, 0.8],
      [weak.id, 0.7],
    ]);
  });

  it("ordena el contexto por puntaje aunque las consultas lleguen desordenadas", () => {
    const report = buildMatchReport(
      "1",
      [
        { text: "a", kind: "other" },
        { text: "b", kind: "other" },
      ],
      [[{ c: weak, score: 0.5 }], [{ c: strong, score: 0.9 }]],
      [],
    );
    expect(report.chunks.map((c) => c.id)).toEqual([strong.id, weak.id]);
  });
});
