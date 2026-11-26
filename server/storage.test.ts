import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DATA_DIR,
  listFiles,
  mtime,
  newId,
  readJson,
  removeFile,
  safeName,
  slugify,
  writeJson,
} from "./storage.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "apply-storage-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("DATA_DIR", () => {
  it("resuelve a una ruta absoluta", () => {
    expect(path.isAbsolute(DATA_DIR)).toBe(true);
  });
});

describe("safeName", () => {
  it("agrega la extensión cuando falta y la respeta cuando existe", () => {
    expect(safeName("perfil", ".md")).toBe("perfil.md");
    expect(safeName("perfil.md", ".md")).toBe("perfil.md");
  });

  it("neutraliza el path traversal quedándose con el nombre base", () => {
    expect(safeName("../../etc/passwd", ".md")).toBe("passwd.md");
    expect(safeName("a/b/c.json", ".json")).toBe("c.json");
  });

  it("reemplaza caracteres no permitidos y conserva acentos, espacios y guiones", () => {
    expect(safeName("mi cv: ñandú*?.md", ".md")).toBe("mi cv_ ñandú__.md");
    expect(safeName("a-b_c.d.md", ".md")).toBe("a-b_c.d.md");
  });

  it("rechaza nombres vacíos u ocultos", () => {
    expect(() => safeName("", ".md")).toThrow("Nombre de archivo inválido");
    expect(() => safeName(".md", ".md")).toThrow("Nombre de archivo inválido");
    expect(() => safeName(".oculto", ".md")).toThrow("Nombre de archivo inválido");
  });
});

describe("newId", () => {
  it("combina fecha ISO, prefijo y sufijo aleatorio", () => {
    expect(newId("cv")).toMatch(/^\d{4}-\d{2}-\d{2}-cv-[a-z0-9]{1,6}$/);
    expect(newId("cv")).not.toBe(newId("cv"));
  });
});

describe("slugify", () => {
  it("quita acentos, pasa a minúsculas y separa con guiones", () => {
    expect(slugify("Ingeniería  Sénior / Ñoño")).toBe("ingenieria-senior-nono");
  });

  it("recorta guiones en los extremos", () => {
    expect(slugify("--Hola Mundo!!")).toBe("hola-mundo");
  });

  it("limita a 40 caracteres", () => {
    expect(slugify("a".repeat(60))).toBe("a".repeat(40));
  });

  it("devuelve vacío si no queda nada", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("listFiles", () => {
  it("filtra por extensión y ordena", async () => {
    await writeFile(path.join(dir, "b.md"), "");
    await writeFile(path.join(dir, "a.md"), "");
    await writeFile(path.join(dir, "c.json"), "");
    expect(await listFiles(dir, ".md")).toEqual(["a.md", "b.md"]);
  });

  it("devuelve vacío si el directorio no existe", async () => {
    expect(await listFiles(path.join(dir, "nope"), ".md")).toEqual([]);
  });
});

describe("readJson / writeJson", () => {
  it("hace roundtrip con indentación de 2 espacios", async () => {
    const file = path.join(dir, "x.json");
    await writeJson(file, { a: 1, b: [2] });
    expect(await readFile(file, "utf8")).toBe(JSON.stringify({ a: 1, b: [2] }, null, 2));
    expect(await readJson(file)).toEqual({ a: 1, b: [2] });
  });

  it("devuelve null si el archivo no existe o el JSON es inválido", async () => {
    expect(await readJson(path.join(dir, "no.json"))).toBeNull();
    const bad = path.join(dir, "bad.json");
    await writeFile(bad, "{no json");
    expect(await readJson(bad)).toBeNull();
  });
});

describe("mtime / removeFile", () => {
  it("lee la fecha de modificación", async () => {
    const file = path.join(dir, "m.md");
    await writeFile(file, "x");
    const when = new Date("2024-01-02T03:04:05Z");
    await utimes(file, when, when);
    expect(await mtime(file)).toBe(when.getTime());
  });

  it("borra el archivo y tolera que no exista", async () => {
    const file = path.join(dir, "r.md");
    await writeFile(file, "x");
    await removeFile(file);
    expect(await listFiles(dir, ".md")).toEqual([]);
    await expect(removeFile(file)).resolves.toBeUndefined();
  });
});
