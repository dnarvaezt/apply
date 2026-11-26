import { describe, expect, it } from "vitest";
import { formatId, parseId } from "./ids.ts";

describe("parseId", () => {
  it("acepta enteros positivos escritos como string", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("42")).toBe(42);
    expect(parseId("2147483647")).toBe(2147483647);
  });

  it("rechaza lo que no es un id de Postgres integer", () => {
    for (const bad of [
      "",
      "0",
      "01",
      "-1",
      "1.5",
      "1e3",
      "abc",
      "1 ",
      " 1",
      "2147483648",
      "99999999999",
    ]) {
      expect(parseId(bad), bad).toBeNull();
    }
  });

  it("rechaza ids viejos con forma de nombre de archivo", () => {
    expect(parseId("2026-01-02-acme-abc123")).toBeNull();
    expect(parseId("../../etc/passwd")).toBeNull();
  });
});

describe("formatId", () => {
  it("serializa como string para no cambiar el contrato JSON", () => {
    expect(formatId(7)).toBe("7");
    expect(parseId(formatId(123))).toBe(123);
  });
});
