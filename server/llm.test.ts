import { describe, expect, it } from "vitest";
import { cleanMarkdown } from "./llm.ts";

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
