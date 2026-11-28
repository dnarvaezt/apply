import type { Vacancy } from "@apply/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanMarkdown,
  draftApplicationEmail,
  extractVacancy,
  extractVacancyFromImage,
  extractVacancyFromWeb,
  streamCv,
} from "./llm.ts";
import { FAKE_TRANSCRIPTION, type FakeClaudeMode, useFakeClaude } from "./test/fake-claude.ts";
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

function useFake(outputs: Record<string, unknown>, mode?: FakeClaudeMode, stream?: string[]) {
  fake = useFakeClaude(outputs, mode, stream);
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

describe("extractVacancyFromImage (AC-002, REQ-002)", () => {
  const IMAGE = { mediaType: "image/png" as const, data: "iVBORw0KGgo=" };

  it("una sola invocación: bloque de imagen por stdin y esquema con transcription draft-07", async () => {
    const f = useFake({ title: extracted() });
    const result = await extractVacancyFromImage(IMAGE);
    expect(result).toMatchObject({ title: "Ingeniero Backend", transcription: FAKE_TRANSCRIPTION });
    const { args, stdin } = f.capture();
    const event = JSON.parse(stdin) as {
      type: string;
      message: { role: string; content: Record<string, unknown>[] };
    };
    expect(event.type).toBe("user");
    expect(event.message.content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: IMAGE.data },
    });
    expect(event.message.content[1]).toMatchObject({ type: "text" });
    expect(args[args.indexOf("--input-format") + 1]).toBe("stream-json");
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1] as string) as {
      $schema: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.properties).toHaveProperty("transcription");
    expect(schema.properties).toHaveProperty("title");
    expect(schema.required).toContain("transcription");
  });

  it("devuelve transcription vacía con la imagen en blanco", async () => {
    useFake({ title: extracted() }, "blank-image");
    await expect(extractVacancyFromImage(IMAGE)).resolves.toMatchObject({ transcription: "" });
  });

  it("rechaza una respuesta sin transcription", async () => {
    useFake({ title: extracted() }, "no-transcription");
    await expect(extractVacancyFromImage(IMAGE)).rejects.toThrow(/formato inválido/);
  });
});

describe("extractVacancyFromWeb (#69)", () => {
  const URL = "https://jobs.example.com/view/42";
  const PAGE =
    "Ingeniero backend con TypeScript y PostgreSQL para operar APIs en producción. ".repeat(2);
  const saved = process.env.CHROME_MCP_BROWSER_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.CHROME_MCP_BROWSER_URL;
    else process.env.CHROME_MCP_BROWSER_URL = saved;
  });
  const mcpServer = (args: string[]) =>
    (
      JSON.parse(args[args.indexOf("--mcp-config") + 1] as string) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      }
    ).mcpServers["chrome-devtools"];

  it("abre la URL con el MCP de Chrome, solo con herramientas de lectura", async () => {
    delete process.env.CHROME_MCP_BROWSER_URL;
    const f = useFake({ pageText: { ...extracted(), pageText: PAGE } });
    await expect(extractVacancyFromWeb(URL)).resolves.toMatchObject({
      title: "Ingeniero Backend",
      pageText: PAGE,
    });
    const { args, stdin } = f.capture();
    expect(stdin).toContain(JSON.stringify(URL));
    expect(args[args.indexOf("--allowedTools") + 1]).toBe(
      "mcp__chrome-devtools__navigate_page,mcp__chrome-devtools__wait_for,mcp__chrome-devtools__take_snapshot",
    );
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    const server = mcpServer(args);
    expect(server?.command).toBe(process.execPath);
    expect(server?.args).toEqual(expect.arrayContaining(["--headless", "--isolated"]));
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1] as string) as {
      required: string[];
    };
    expect(schema.required).toContain("pageText");
  });

  it("con CHROME_MCP_BROWSER_URL se conecta al Chrome abierto en vez de lanzar uno", async () => {
    process.env.CHROME_MCP_BROWSER_URL = "http://127.0.0.1:9222";
    const f = useFake({ pageText: { ...extracted(), pageText: PAGE } });
    await extractVacancyFromWeb(URL);
    const server = mcpServer(f.capture().args);
    expect(server?.args).toEqual(expect.arrayContaining(["--browserUrl", "http://127.0.0.1:9222"]));
    expect(server?.args).not.toContain("--headless");
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

describe("streamCv (REQ-001, REQ-002, REQ-004)", () => {
  const vacancy: Vacancy = {
    ...newVacancy({ title: "Backend Engineer", rawText: "texto original" }),
    id: "7",
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const CHUNKS = ["# Ana\n\n", "**Dev**\n", "fin"];

  async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
    const out: string[] = [];
    for await (const chunk of iterable) out.push(chunk);
    return out;
  }

  it("reemite cada text_delta en orden (AC-001)", async () => {
    useFake({}, undefined, CHUNKS);
    expect(await collect(streamCv(vacancy, [], undefined))).toEqual(CHUNKS);
  });

  it("envía por stdin el perfil, la vacante y las instrucciones, y pide stream-json con effort high (AC-002)", async () => {
    const f = useFake({}, undefined, CHUNKS);
    await collect(
      streamCv(
        vacancy,
        [{ id: "c1", file: "perfil.md", heading: "Exp", text: "TypeScript", score: 1 }],
        "  sé breve  ",
      ),
    );
    const { args, stdin } = f.capture();
    expect(args).toContain("--include-partial-messages");
    expect(args[args.indexOf("--effort") + 1]).toBe("high");
    expect(stdin).toContain('<fragmento archivo="perfil.md" seccion="Exp">');
    expect(stdin).toContain("<vacante>");
    expect(stdin).toContain("Backend Engineer");
    expect(stdin).toContain("<instrucciones_adicionales>\nsé breve\n</instrucciones_adicionales>");
    expect(stdin).toContain("Escribe el CV adaptado a esta vacante.");
    expect(args[args.indexOf("--system-prompt") + 1]).toContain("CV");
  });

  it("termina al hijo con SIGTERM cuando se aborta el stream (AC-003)", async () => {
    const f = useFake({}, "hang", CHUNKS);
    const controller = new AbortController();
    const received: string[] = [];
    for await (const chunk of streamCv(vacancy, [], undefined, controller.signal)) {
      received.push(chunk);
      controller.abort();
    }
    expect(received).toEqual([CHUNKS[0]]);
    expect(isAlive(f.pid())).toBe(false);
  });

  it("termina al hijo si el consumidor deja de iterar", async () => {
    const f = useFake({}, "hang", CHUNKS);
    for await (const _ of streamCv(vacancy, [], undefined)) break;
    expect(isAlive(f.pid())).toBe(false);
  });

  it("falla con mensaje claro si el binario no existe (AC-005)", async () => {
    useFake({}, undefined, CHUNKS);
    process.env.CLAUDE_BIN = "/no/existe/claude";
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      "No se encontró el binario de Claude (/no/existe/claude). Instala la CLI o define CLAUDE_BIN.",
    );
  });

  it("falla con el detalle cuando el result trae is_error (AC-005)", async () => {
    useFake({}, "error", CHUNKS);
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      "Claude falló: fallo simulado",
    );
  });

  it("falla por autenticación y mata al hijo sin esperar el timeout (AC-005)", async () => {
    const f = useFake({}, "auth", CHUNKS);
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(/\/login/);
    expect(isAlive(f.pid())).toBe(false);
  });

  it("falla por límite de la suscripción y mata al hijo (AC-005)", async () => {
    const f = useFake({}, "rate-limit", CHUNKS);
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      /límite de uso de la suscripción/,
    );
    expect(isAlive(f.pid())).toBe(false);
  });

  it("falla con exit distinto de 0 sin result", async () => {
    useFake({}, "exit1", CHUNKS);
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      /Claude terminó con código 1.*fallo simulado/,
    );
  });

  it("falla si termina bien pero sin ningún texto", async () => {
    useFake({}, "no-delta", CHUNKS);
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      "Claude no devolvió texto para el CV.",
    );
  });

  it("termina al hijo cuando vence CLAUDE_TIMEOUT_MS", async () => {
    const f = useFake({}, "hang", CHUNKS);
    process.env.CLAUDE_TIMEOUT_MS = "800";
    await expect(collect(streamCv(vacancy, [], undefined))).rejects.toThrow(
      /excedió el tiempo límite de 800 ms/,
    );
    expect(isAlive(f.pid())).toBe(false);
  });
});
