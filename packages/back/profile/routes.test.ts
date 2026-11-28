import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProfileFile, ProfileOrder } from "@apply/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { profileRoutes } from "./routes.ts";

let dir: string;
let app: ReturnType<typeof profileRoutes>;

const seed = (...names: string[]) =>
  Promise.all(names.map((n) => writeFile(path.join(dir, n), `# ${n}`, "utf8")));
const names = async () =>
  ((await (await app.request("/profile")).json()) as ProfileFile[]).map((f) => f.name);
const mdFiles = async () => (await readdir(dir)).filter((n) => n.endsWith(".md")).sort();
const send = (url: string, method: string, body: unknown) =>
  app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const setOrder = (order: ProfileOrder) => send("/profile-order", "PUT", order);
const rename = (from: string, to: string) =>
  send(`/profile/${encodeURIComponent(from)}/rename`, "POST", { to });

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "apply-profile-"));
  app = profileRoutes({ dir });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("orden de los archivos del perfil", () => {
  it("sin orden guardado lista alfabéticamente con números en orden natural", async () => {
    await seed("b.md", "10-x.md", "2-y.md", "a.md");
    expect(await names()).toEqual(["2-y.md", "10-x.md", "a.md", "b.md"]);
    expect(await (await app.request("/profile-order")).json()).toEqual({
      mode: "alpha",
      order: [],
    });
  });

  it("en modo personalizado respeta el orden guardado y deja los nuevos al final, alfabéticos", async () => {
    await seed("a.md", "b.md", "c.md", "d.md");
    expect(
      (await setOrder({ mode: "custom", order: ["c.md", "a.md", "fantasma.md"] })).status,
    ).toBe(200);
    expect(await names()).toEqual(["c.md", "a.md", "b.md", "d.md"]);
  });

  it("el modo alfabético ignora el orden manual pero lo conserva", async () => {
    await seed("a.md", "b.md");
    await setOrder({ mode: "alpha", order: ["b.md", "a.md"] });
    expect(await names()).toEqual(["a.md", "b.md"]);
    expect(await (await app.request("/profile-order")).json()).toEqual({
      mode: "alpha",
      order: ["b.md", "a.md"],
    });
  });

  it("rechaza un orden mal formado sin guardarlo", async () => {
    await seed("a.md", "b.md");
    const res = await send("/profile-order", "PUT", { mode: "otro", order: "a.md" });
    expect(res.status).toBe(400);
    expect(await (await app.request("/profile-order")).json()).toEqual({
      mode: "alpha",
      order: [],
    });
  });

  it("el archivo del orden no aparece como archivo del perfil", async () => {
    await seed("a.md");
    await setOrder({ mode: "custom", order: ["a.md"] });
    expect(await names()).toEqual(["a.md"]);
  });

  it("borrar un archivo lo quita del orden guardado", async () => {
    await seed("a.md", "b.md");
    await setOrder({ mode: "custom", order: ["b.md", "a.md"] });
    expect((await app.request("/profile/b.md", { method: "DELETE" })).status).toBe(200);
    expect(await (await app.request("/profile-order")).json()).toEqual({
      mode: "custom",
      order: ["a.md"],
    });
  });
});

describe("POST /profile/:name/rename", () => {
  it("renombra conservando el contenido y agrega .md si falta", async () => {
    await seed("a.md");
    const res = await rename("a.md", "00-nuevo");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "00-nuevo.md" });
    expect(await mdFiles()).toEqual(["00-nuevo.md"]);
    expect(await readFile(path.join(dir, "00-nuevo.md"), "utf8")).toBe("# a.md");
  });

  it("nunca cambia la extensión: otro sufijo queda antes de .md", async () => {
    await seed("a.md");
    expect(await (await rename("a.md", "notas.txt")).json()).toEqual({ name: "notas.txt.md" });
  });

  it("mantiene la posición del archivo en el orden personalizado", async () => {
    await seed("a.md", "b.md", "c.md");
    await setOrder({ mode: "custom", order: ["c.md", "a.md", "b.md"] });
    await rename("a.md", "z.md");
    expect(await names()).toEqual(["c.md", "z.md", "b.md"]);
  });

  it("rechaza con 409 un nombre ya usado y no toca ningún archivo", async () => {
    await seed("a.md", "b.md");
    const res = await rename("a.md", "b.md");
    expect(res.status).toBe(409);
    expect(await mdFiles()).toEqual(["a.md", "b.md"]);
    expect(await readFile(path.join(dir, "b.md"), "utf8")).toBe("# b.md");
  });

  it("responde 404 si el archivo de origen no existe", async () => {
    expect((await rename("no.md", "x.md")).status).toBe(404);
  });

  it("responde 400 ante un nombre inválido", async () => {
    await seed("a.md");
    expect((await rename("a.md", ".oculto")).status).toBe(400);
    expect((await rename("a.md", "  ")).status).toBe(400);
    expect(await mdFiles()).toEqual(["a.md"]);
  });

  it("renombrar al mismo nombre no falla ni cambia nada", async () => {
    await seed("a.md");
    const res = await rename("a.md", "a");
    expect(res.status).toBe(200);
    expect(await mdFiles()).toEqual(["a.md"]);
  });
});

describe("guardar y borrar siguen igual", () => {
  it("PUT crea el archivo con .md y DELETE lo borra", async () => {
    await send("/profile/nuevo", "PUT", { content: "hola" });
    expect(await readFile(path.join(dir, "nuevo.md"), "utf8")).toBe("hola");
    await app.request("/profile/nuevo.md", { method: "DELETE" });
    expect(await names()).toEqual([]);
  });
});
