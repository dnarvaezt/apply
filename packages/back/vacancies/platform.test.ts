import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform.ts";

describe("detectPlatform (REQ-006)", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/1", "texto"],
    ["https://es.linkedin.com/jobs/view/1", "texto"],
    ["https://LinkedIn.com/jobs/view/1", "texto"],
  ])("URL de LinkedIn %s", (url, text) => {
    expect(detectPlatform(url, text)).toBe("linkedin");
  });

  it("texto pegado que menciona LinkedIn", () => {
    expect(detectPlatform(null, "Ver más ofertas en LinkedIn. Meet the hiring team")).toBe(
      "linkedin",
    );
    expect(detectPlatform(null, "Easy Apply on linkedin.com/jobs")).toBe("linkedin");
  });

  it("otra plataforma o sin pistas es manual", () => {
    expect(detectPlatform("https://example.com/careers/1", "Buscamos dev")).toBe("manual");
    expect(detectPlatform(null, "Buscamos dev")).toBe("manual");
  });

  it("un dominio parecido no es LinkedIn", () => {
    expect(detectPlatform("https://notlinkedin.com/x", "Buscamos dev")).toBe("manual");
    expect(detectPlatform("https://linkedin.com.evil.com/x", "Buscamos dev")).toBe("manual");
  });

  it("una URL inválida no rompe", () => {
    expect(detectPlatform("no es url", "Buscamos dev")).toBe("manual");
  });
});
