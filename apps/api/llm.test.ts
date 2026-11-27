import type { Vacancy } from "@apply/shared";
import { describe, expect, it } from "vitest";
import { cleanMarkdown, draftApplicationEmail, extractVacancy } from "./llm.ts";
import { fixtureAnthropic } from "./test/anthropic-fixture.ts";
import { extracted, newVacancy } from "./test/fixtures.ts";

describe("cleanMarkdown", () => {
  it("quita la cerca ```markdown que envuelve la respuesta", () => {
    expect(cleanMarkdown("```markdown\n# CV\n\ntexto\n```")).toBe("# CV\n\ntexto");
    expect(cleanMarkdown("```md\n# CV\n```")).toBe("# CV");
    expect(cleanMarkdown("```\n# CV\n```\n")).toBe("# CV");
  });

  it("deja intacto el markdown sin cerca y recorta espacios", () => {
    expect(cleanMarkdown("  # CV\n- a  \n")).toBe("# CV\n- a");
  });

  it("no toca bloques de código internos", () => {
    const md = "# CV\n\n```ts\nconst a = 1;\n```\n\nfin";
    expect(cleanMarkdown(md)).toBe(md);
  });
});

describe("extractVacancy: poster y fecha (AC-001)", () => {
  const WITH_POSTER = `Senior Backend Engineer · ACME
Meet the hiring team
Laura Gómez
Technical Recruiter at ACME
Publicado hace 3 días`;

  it("devuelve poster y fecha relativa cuando el texto los contiene", async () => {
    const { api, requests } = fixtureAnthropic(
      extracted({
        posterName: "Laura Gómez",
        posterTitle: "Technical Recruiter",
        postedAtText: "hace 3 días",
      }),
    );
    const result = await extractVacancy(WITH_POSTER, api);
    expect(result).toMatchObject({
      posterName: "Laura Gómez",
      posterTitle: "Technical Recruiter",
      postedAtText: "hace 3 días",
    });
    const sent = JSON.stringify(requests[0]);
    expect(sent).toContain("Meet the hiring team");
    expect(sent).toContain("posterName");
    expect(sent).toContain("postedAtText");
  });

  it("devuelve NULL cuando el texto no trae poster ni fecha", async () => {
    const { api } = fixtureAnthropic(extracted());
    const result = await extractVacancy("Buscamos backend con TypeScript.", api);
    expect(result).toMatchObject({ posterName: null, posterTitle: null, postedAtText: null });
  });

  it("rechaza una respuesta sin los campos de poster", async () => {
    const { posterName: _, ...withoutPoster } = extracted();
    const { api } = fixtureAnthropic(withoutPoster);
    await expect(extractVacancy("texto", api)).rejects.toThrow();
  });
});

describe("draftApplicationEmail (AC-001, AC-002)", () => {
  const vacancy = (overrides: Partial<Vacancy> = {}): Vacancy => ({
    ...newVacancy({ language: "en", posterName: "Jane Doe", title: "Backend Engineer" }),
    id: "7",
    createdAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  });
  const CV = "# Ana Pérez\n\n## Summary\n\nTypeScript and PostgreSQL engineer.";
  const EMAIL = { subject: "Backend Engineer application", body: "I am applying.", language: "en" };

  it("envía la vacante, el CV y el poster sin streaming, y devuelve el borrador validado", async () => {
    const { api, requests } = fixtureAnthropic(EMAIL);
    const draft = await draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV }, api);
    expect(draft).toEqual(EMAIL);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.stream).toBeUndefined();
    const sent = JSON.stringify(request);
    expect(sent).toContain("TypeScript and PostgreSQL engineer.");
    expect(sent).toContain("Backend Engineer");
    expect(sent).toContain("Jane Doe");
    expect(sent).toContain('"subject"');
  });

  it("pide escribir en el idioma de la vacante", async () => {
    const { api, requests } = fixtureAnthropic({ ...EMAIL, language: "es" });
    await draftApplicationEmail({ vacancy: vacancy({ language: "es" }), cvMarkdown: CV }, api);
    expect(JSON.stringify(requests[0])).toContain("Idioma del correo: es");
  });

  it("rechaza un borrador en otro idioma que el de la vacante", async () => {
    const { api } = fixtureAnthropic({ ...EMAIL, language: "es" });
    await expect(
      draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV }, api),
    ).rejects.toThrow(/idioma/);
  });

  it("rechaza una respuesta que no cumple el esquema", async () => {
    const { api } = fixtureAnthropic({ subject: "Sin cuerpo", language: "en" });
    await expect(
      draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV }, api),
    ).rejects.toThrow();
  });
});
