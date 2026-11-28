import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "./chunk.ts";

describe("chunkMarkdown", () => {
  it("devuelve vacío para un markdown sin contenido", () => {
    expect(chunkMarkdown("a.md", "")).toEqual([]);
    expect(chunkMarkdown("a.md", "# Solo título\n\n")).toEqual([]);
  });

  it("usa el nombre del archivo como encabezado cuando no hay títulos", () => {
    expect(chunkMarkdown("perfil.md", "hola mundo")).toEqual([
      { id: "perfil.md#0", file: "perfil.md", heading: "perfil.md", text: "hola mundo" },
    ]);
  });

  it("conserva la ruta de encabezados anidados", () => {
    const md = "# Experiencia\n## Empresa X\nHice cosas\n## Empresa Y\nHice otras";
    const chunks = chunkMarkdown("cv.md", md);
    expect(chunks.map((c) => c.heading)).toEqual([
      "Experiencia > Empresa X",
      "Experiencia > Empresa Y",
    ]);
    expect(chunks.map((c) => c.id)).toEqual(["cv.md#0", "cv.md#1"]);
    expect(chunks.map((c) => c.text)).toEqual(["Hice cosas", "Hice otras"]);
  });

  it("descarta niveles más profundos al volver a un encabezado superior", () => {
    const md = "# A\n## B\n### C\ntexto c\n# D\ntexto d";
    expect(chunkMarkdown("f.md", md).map((c) => c.heading)).toEqual(["A > B > C", "D"]);
  });

  it("normaliza saltos de línea CRLF", () => {
    const chunks = chunkMarkdown("f.md", "# T\r\nlinea1\r\nlinea2");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("linea1\nlinea2");
  });

  it("no trata '#' sin espacio como encabezado", () => {
    const chunks = chunkMarkdown("f.md", "#hashtag\n####### siete");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("f.md");
  });

  it("parte secciones largas por viñetas repitiendo el encabezado", () => {
    const bullets = Array.from({ length: 40 }, (_, i) => `- viñeta ${i} ${"x".repeat(60)}`);
    const chunks = chunkMarkdown("f.md", `# Logros\n${bullets.join("\n")}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("Logros");
      expect(chunk.text.length).toBeLessThanOrEqual(1400);
      expect(chunk.text.startsWith("- viñeta")).toBe(true);
    }
    expect(chunks.map((c) => c.text).join("\n")).toBe(bullets.join("\n"));
    expect(chunks.map((c) => c.id)).toEqual(chunks.map((_, i) => `f.md#${i}`));
  });

  it("no parte una sección que mide exactamente el máximo", () => {
    const body = "a".repeat(1400);
    expect(chunkMarkdown("f.md", `# T\n${body}`)).toHaveLength(1);
  });

  it("parte por listas numeradas y por líneas en blanco", () => {
    const items = Array.from({ length: 30 }, (_, i) => `${i + 1}. ${"y".repeat(80)}`);
    const numbered = chunkMarkdown("f.md", `# N\n${items.join("\n")}`);
    expect(numbered.length).toBeGreaterThan(1);
    expect(numbered.every((c) => c.text.length <= 1400)).toBe(true);

    const paragraphs = Array.from({ length: 12 }, (_, i) => `${"p".repeat(200)}${i}`);
    const parts = chunkMarkdown("f.md", `# P\n${paragraphs.join("\n\n")}`);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((c) => c.text.length <= 1400)).toBe(true);
  });
});
