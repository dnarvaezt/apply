import { describe, expect, it } from "vitest";
import { cleanMarkdown, extractVacancy } from "./llm.ts";
import { fixtureAnthropic } from "./test/anthropic-fixture.ts";
import { extracted } from "./test/fixtures.ts";

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
