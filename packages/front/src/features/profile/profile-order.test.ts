import { describe, expect, it } from "vitest";
import { baseName, moveName } from "./profile-order.ts";

describe("moveName", () => {
  const names = ["a.md", "b.md", "c.md"];

  it("sube y baja una posición", () => {
    expect(moveName(names, "b.md", -1)).toEqual(["b.md", "a.md", "c.md"]);
    expect(moveName(names, "b.md", 1)).toEqual(["a.md", "c.md", "b.md"]);
  });

  it("en los bordes o con un nombre ajeno no cambia nada", () => {
    expect(moveName(names, "a.md", -1)).toEqual(names);
    expect(moveName(names, "c.md", 1)).toEqual(names);
    expect(moveName(names, "x.md", 1)).toEqual(names);
  });

  it("no modifica la lista recibida", () => {
    moveName(names, "a.md", 1);
    expect(names).toEqual(["a.md", "b.md", "c.md"]);
  });
});

describe("baseName", () => {
  it("quita solo la extensión final .md", () => {
    expect(baseName("10-exp.md")).toBe("10-exp");
    expect(baseName("notas.md.md")).toBe("notas.md");
    expect(baseName("sin-ext")).toBe("sin-ext");
  });
});
