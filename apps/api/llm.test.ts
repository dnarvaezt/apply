import type { Vacancy } from "@apply/shared";
import { afterEach, describe, expect, it } from "vitest";
import { cleanMarkdown, draftApplicationEmail, extractVacancy } from "./llm.ts";
import { type FakeClaudeMode, useFakeClaude } from "./test/fake-claude.ts";
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

  it("quita la cerca aun con espacios en blanco alrededor, en la apertura y en el cierre", () => {
    expect(cleanMarkdown("  ```markdown  \n# CV\n```  \n\n")).toBe("# CV");
    expect(cleanMarkdown("```md\n# CV\n```   ")).toBe("# CV");
  });

  it("no toca bloques de código internos", () => {
    const md = "# CV\n\n```ts\nconst a = 1;\n```\n\nfin";
    expect(cleanMarkdown(md)).toBe(md);
  });
});

let fake: ReturnType<typeof useFakeClaude> | undefined;
afterEach(() => fake?.restore());

function useFake(outputs: Record<string, unknown>, mode?: FakeClaudeMode) {
  fake = useFakeClaude(outputs, mode);
  return fake;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("extractVacancy: poster y fecha (AC-001)", () => {
  const WITH_POSTER = `Senior Backend Engineer · ACME
Meet the hiring team
Laura Gómez
Technical Recruiter at ACME
Publicado hace 3 días`;

  it("devuelve poster y fecha relativa cuando el texto los contiene", async () => {
    const f = useFake({
      title: extracted({
        posterName: "Laura Gómez",
        posterTitle: "Technical Recruiter",
        postedAtText: "hace 3 días",
      }),
    });
    const result = await extractVacancy(WITH_POSTER);
    expect(result).toMatchObject({
      posterName: "Laura Gómez",
      posterTitle: "Technical Recruiter",
      postedAtText: "hace 3 días",
    });
    const { args, stdin } = f.capture();
    expect(stdin).toBe(`<vacante>\n${WITH_POSTER}\n</vacante>`);
    expect(args[args.indexOf("--json-schema") + 1]).toContain("posterName");
    expect(args[args.indexOf("--json-schema") + 1]).toContain("postedAtText");
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
  });

  it("devuelve NULL cuando el texto no trae poster ni fecha", async () => {
    useFake({ title: extracted() });
    const result = await extractVacancy("Buscamos backend con TypeScript.");
    expect(result).toMatchObject({ posterName: null, posterTitle: null, postedAtText: null });
  });

  it("rechaza una respuesta sin los campos de poster", async () => {
    const { posterName: _, ...withoutPoster } = extracted();
    useFake({ title: withoutPoster });
    await expect(extractVacancy("texto")).rejects.toThrow(/formato inválido/);
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

  it("envía la vacante, el CV y el poster, y devuelve el borrador validado", async () => {
    const f = useFake({ subject: EMAIL });
    const draft = await draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV });
    expect(draft).toEqual(EMAIL);
    const { args, stdin } = f.capture();
    expect(stdin).toContain("TypeScript and PostgreSQL engineer.");
    expect(stdin).toContain("Backend Engineer");
    expect(stdin).toContain("Jane Doe");
    expect(args[args.indexOf("--json-schema") + 1]).toContain('"subject"');
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
  });

  it("pide escribir en el idioma de la vacante", async () => {
    const f = useFake({ subject: { ...EMAIL, language: "es" } });
    await draftApplicationEmail({ vacancy: vacancy({ language: "es" }), cvMarkdown: CV });
    expect(f.capture().stdin).toContain("Idioma del correo: es");
  });

  it("rechaza un borrador en otro idioma que el de la vacante", async () => {
    useFake({ subject: { ...EMAIL, language: "es" } });
    await expect(draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV })).rejects.toThrow(
      /idioma/,
    );
  });

  it("rechaza una respuesta que no cumple el esquema", async () => {
    useFake({ subject: { subject: "Sin cuerpo", language: "en" } });
    await expect(draftApplicationEmail({ vacancy: vacancy(), cvMarkdown: CV })).rejects.toThrow(
      /correo estructurado con un formato inválido/,
    );
  });
});

describe("frontera con la CLI (AC-003, AC-004, AC-005)", () => {
  const VACANCY = { title: extracted() };

  it("el hijo no recibe ANTHROPIC_* aunque el padre las tenga, incluso vacías", async () => {
    useFake(VACANCY);
    const saved = { ...process.env };
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    try {
      await expect(extractVacancy("texto")).resolves.toMatchObject({ title: "Ingeniero Backend" });
    } finally {
      for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) {
        if (saved[k] === undefined) delete process.env[k];
      }
    }
  });

  it("el binario falso rechaza un esquema 2020-12 con exit 1 y el error se propaga", async () => {
    useFake(VACANCY);
    const { FAKE_CLAUDE_BIN } = await import("./test/fake-claude.ts");
    const { runClaudeProcess } = await import("./claude/runner.ts");
    const { buildClaudeArgs } = await import("./claude/cli.ts");
    const args = buildClaudeArgs({
      model: "m",
      system: "s",
      jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" },
    });
    await expect(
      runClaudeProcess({ bin: FAKE_CLAUDE_BIN, args, stdin: "x", timeoutMs: 10_000 }),
    ).rejects.toThrow(/código 1.*not a valid JSON Schema/);
  });

  it("falla con mensaje claro si el binario no existe (ENOENT)", async () => {
    useFake(VACANCY);
    process.env.CLAUDE_BIN = "/no/existe/claude";
    await expect(extractVacancy("texto")).rejects.toThrow(/No se encontró el binario de Claude/);
  });

  it("falla con is_error:true", async () => {
    useFake(VACANCY, "error");
    await expect(extractVacancy("texto")).rejects.toThrow("Claude falló: fallo simulado");
  });

  it("falla si success no trae structured_output", async () => {
    useFake(VACANCY, "no-structured");
    await expect(extractVacancy("texto")).rejects.toThrow(
      "Claude no devolvió la vacante estructurada",
    );
  });

  it("falla con exit distinto de 0", async () => {
    useFake(VACANCY, "exit1");
    await expect(extractVacancy("texto")).rejects.toThrow(
      /Claude terminó con código 1.*fallo simulado/,
    );
  });

  it("termina al hijo cuando vence CLAUDE_TIMEOUT_MS", async () => {
    const f = useFake(VACANCY, "hang");
    process.env.CLAUDE_TIMEOUT_MS = "800";
    await expect(extractVacancy("texto")).rejects.toThrow(/excedió el tiempo límite de 800 ms/);
    expect(isAlive(f.pid())).toBe(false);
  });
});
