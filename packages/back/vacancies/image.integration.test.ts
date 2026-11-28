import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Vacancy } from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applications, vacancies } from "#db";
import { extractVacancy, extractVacancyFromImage } from "../llm.ts";
import { FAKE_TRANSCRIPTION, type FakeClaudeMode, useFakeClaude } from "../test/fake-claude.ts";
import { extracted } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES } from "./image.ts";
import { createImageStore } from "./image-store.ts";
import { createVacanciesRepository } from "./repository.ts";
import { vacancyRoutes } from "./routes.ts";

// Imagen de verdad no hace falta: el binario falso no la decodifica.
const PNG = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
const fetchText = vi.fn();
let iso: IsolatedDb;
let app: Hono;
let dataDir: string;
let fake: ReturnType<typeof useFakeClaude> | undefined;

beforeAll(async () => {
  iso = await createIsolatedDb();
  dataDir = await mkdtemp(path.join(tmpdir(), "vacancy-image-api-"));
  app = new Hono().basePath("/api").route(
    "/",
    vacancyRoutes({
      repo: createVacanciesRepository(iso.db),
      imageStore: createImageStore(path.join(dataDir, "vacancy-images")),
      fetchText,
      extract: extractVacancy,
      extractFromImage: extractVacancyFromImage,
      extractFromWeb: async () => {
        throw new Error("no se usa");
      },
      retrieve: async () => {
        throw new Error("no se usa");
      },
    }),
  );
});
afterAll(async () => {
  await iso.drop();
  await rm(dataDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await iso.db.execute(sql`TRUNCATE applications, vacancies, companies RESTART IDENTITY CASCADE`);
  await rm(path.join(dataDir, "vacancy-images"), { recursive: true, force: true });
});
afterEach(() => fake?.restore());

function useFake(mode?: FakeClaudeMode) {
  fake = useFakeClaude({ title: extracted() }, mode);
  return fake;
}

const post = (body: unknown, raw = false) =>
  app.request("/api/vacancies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const rows = () => iso.db.select().from(vacancies);

describe("POST /vacancies con imagen", () => {
  it("AC-001: crea la vacante con la transcripción recortada, source image y sourceUrl null", async () => {
    const f = useFake();
    const res = await post({ image: { mediaType: "image/png", data: PNG } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Vacancy;
    expect(body).toMatchObject({
      rawText: FAKE_TRANSCRIPTION.trim(),
      sourceUrl: null,
      title: "Ingeniero Backend",
      company: "ACME S.A.",
    });
    const [row] = await rows();
    expect(row).toMatchObject({ source: "image", sourceUrl: null });
    expect(row?.description).toBe(FAKE_TRANSCRIPTION.trim());
    expect(f.invoked()).toBe(true);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("AC-003: con la imagen en blanco responde 422 y no crea la fila", async () => {
    useFake("blank-image");
    const res = await post({ image: { mediaType: "image/png", data: PNG } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No se pudo leer texto suficiente de la imagen" });
    expect(await rows()).toHaveLength(0);
  });

  it("REQ-003: una transcripción de menos de 80 caracteres también es 422", async () => {
    useFake("short-image");
    const res = await post({ image: { mediaType: "image/png", data: PNG } });
    expect(res.status).toBe(422);
    expect(await rows()).toHaveLength(0);
  });

  it.each([
    ["image/gif", PNG],
    ["image/png", "esto no es base64!"],
  ])(
    "AC-004: mediaType %s con data inválida o no permitida responde 400 sin invocar la CLI",
    async (mediaType, data) => {
      const f = useFake();
      const res = await post({ image: { mediaType, data } });
      expect(res.status).toBe(400);
      expect(f.invoked()).toBe(false);
    },
  );

  it("AC-005: una imagen de más de 5 MB decodificados responde 413 sin invocar la CLI", async () => {
    const f = useFake();
    const data = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");
    const res = await post({ image: { mediaType: "image/png", data } });
    expect(res.status).toBe(413);
    expect(f.invoked()).toBe(false);
  });

  it("AC-005: un body de más de 8 MB en POST /vacancies responde 413 con mensaje claro", async () => {
    const f = useFake();
    const res = await post(`{"text":"${"a".repeat(MAX_BODY_BYTES + 10)}"}`, true);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/demasiado grande/i) });
    expect(f.invoked()).toBe(false);
  });

  it("AC-005: el límite de 8 MB no aplica a otras rutas", async () => {
    const res = await app.request("/api/vacancies/1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: `{"posterName":"${"a".repeat(MAX_BODY_BYTES + 10)}"}`,
    });
    expect(res.status).not.toBe(413);
  });
});

const imageDir = () => path.join(dataDir, "vacancy-images");
const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );
const createFromImage = async () => {
  useFake();
  const res = await post({ image: { mediaType: "image/png", data: PNG } });
  return ((await res.json()) as Vacancy).id;
};

describe("imagen original de la vacante (#57)", () => {
  it("AC-001: guarda la imagen en vacancy-images/<id>.png con los bytes enviados", async () => {
    const id = await createFromImage();
    const saved = path.join(imageDir(), `${id}.png`);
    expect(await exists(saved)).toBe(true);
    expect(await readFile(saved)).toEqual(Buffer.from(PNG, "base64"));
  });

  it("AC-002: GET /vacancies/:id/image devuelve 200, image/png y los mismos bytes", async () => {
    const id = await createFromImage();
    const res = await app.request(`/api/vacancies/${id}/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(PNG, "base64"));
  });

  it("AC-002: una vacante de texto no tiene imagen: 404", async () => {
    useFake();
    const res = await post({ text: "x".repeat(120) });
    const { id } = (await res.json()) as Vacancy;
    expect((await app.request(`/api/vacancies/${id}/image`)).status).toBe(404);
    expect(await exists(imageDir())).toBe(false);
  });

  it("AC-003: ids no numéricos o con path traversal dan 404 y no leen fuera del directorio", async () => {
    await createFromImage();
    await writeFile(path.join(dataDir, "secret.png"), "secreto");
    for (const id of [
      "..%2Fsecret",
      "..%2F..%2Fetc%2Fpasswd",
      "abc",
      "1%2F..%2F..%2Fsecret",
      "0",
    ]) {
      const res = await app.request(`/api/vacancies/${id}/image`);
      expect([400, 404]).toContain(res.status);
      expect(await res.text()).not.toContain("secreto");
    }
  });

  it("AC-004: borrar la vacante elimina el archivo; borrar otra sin archivo no falla", async () => {
    const id = await createFromImage();
    const res = await app.request(`/api/vacancies/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await readdir(imageDir())).toEqual([]);
    expect((await app.request(`/api/vacancies/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await app.request("/api/vacancies/9999", { method: "DELETE" })).status).toBe(200);
  });

  it("AC-005: si el borrado falla por una postulación, la imagen se conserva", async () => {
    const id = await createFromImage();
    await iso.db.insert(applications).values({ vacancyId: Number(id) });
    const res = await app.request(`/api/vacancies/${id}`, { method: "DELETE" });
    expect(res.status).toBe(500);
    expect(await exists(path.join(imageDir(), `${id}.png`))).toBe(true);
    expect((await app.request(`/api/vacancies/${id}/image`)).status).toBe(200);
  });
});
