import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createImageStore } from "./image-store.ts";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
let root: string;
let dir: string;
let store: ReturnType<typeof createImageStore>;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "vacancy-images-"));
  dir = path.join(root, "vacancy-images");
  store = createImageStore(dir);
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("almacén de imágenes de vacantes", () => {
  it("REQ-001: guarda en <dir>/<id>.<ext>, creando el directorio, y lo devuelve con su mediaType", async () => {
    await store.save("12", { mediaType: "image/png", data: PNG.toString("base64") });
    expect(await readdir(dir)).toEqual(["12.png"]);
    expect(await readFile(path.join(dir, "12.png"))).toEqual(PNG);
    expect(await store.read("12")).toEqual({ mediaType: "image/png", bytes: PNG });
  });

  it.each([
    ["image/jpeg", "3.jpg"],
    ["image/webp", "3.webp"],
  ] as const)("REQ-002: lee %s como su mediaType", async (mediaType, file) => {
    await store.save("3", { mediaType, data: PNG.toString("base64") });
    expect(await readdir(dir)).toEqual([file]);
    expect((await store.read("3"))?.mediaType).toBe(mediaType);
  });

  it("REQ-002: devuelve null si la vacante no tiene imagen (con o sin directorio)", async () => {
    expect(await store.read("5")).toBeNull();
    await mkdir(dir, { recursive: true });
    expect(await store.read("5")).toBeNull();
  });

  it("REQ-003: ids no numéricos o con path traversal no leen nada fuera del directorio", async () => {
    await writeFile(path.join(root, "secret.png"), PNG);
    await mkdir(dir, { recursive: true });
    for (const id of [
      "..",
      "../secret",
      "../secret.png",
      "..%2Fsecret",
      "1/../../secret",
      "abc",
      "01",
      "",
    ]) {
      expect(await store.read(id)).toBeNull();
    }
  });

  it("REQ-004: remove borra el archivo y es idempotente", async () => {
    await store.save("9", { mediaType: "image/png", data: PNG.toString("base64") });
    await store.remove("9");
    expect(await readdir(dir)).toEqual([]);
    await expect(store.remove("9")).resolves.toBeUndefined();
    await expect(store.remove("no-es-id")).resolves.toBeUndefined();
  });

  it("REQ-004: remove no toca la imagen de otra vacante", async () => {
    await store.save("1", { mediaType: "image/png", data: PNG.toString("base64") });
    await store.save("10", { mediaType: "image/png", data: PNG.toString("base64") });
    await store.remove("1");
    expect(await readdir(dir)).toEqual(["10.png"]);
  });
});
