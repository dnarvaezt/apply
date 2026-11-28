import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "./normalize.ts";

describe("normalizeCompanyName", () => {
  it("iguala mayúsculas, puntos y acentos", () => {
    expect(normalizeCompanyName("ACME S.A.")).toBe("acme sa");
    expect(normalizeCompanyName("acme sa")).toBe("acme sa");
    expect(normalizeCompanyName("Compañía Ñandú")).toBe("compania nandu");
  });

  it("colapsa separadores y recorta extremos", () => {
    expect(normalizeCompanyName("  Foo -- Bar,  Baz!  ")).toBe("foo bar baz");
    expect(normalizeCompanyName("Foo/Bar")).toBe("foo bar");
  });

  it("quita apóstrofos sin partir la palabra", () => {
    expect(normalizeCompanyName("O'Reilly")).toBe("oreilly");
    expect(normalizeCompanyName("O’Reilly")).toBe("oreilly");
  });

  it("conserva dígitos y letras de otros alfabetos", () => {
    expect(normalizeCompanyName("3M")).toBe("3m");
    expect(normalizeCompanyName("Яндекс")).toBe("яндекс");
  });

  it("no devuelve cadena vacía para nombres solo con símbolos", () => {
    expect(normalizeCompanyName(" ¿?! ")).toBe("¿?!");
  });

  it("distingue empresas distintas", () => {
    expect(normalizeCompanyName("Acme")).not.toBe(normalizeCompanyName("Acme Labs"));
  });
});
