import { vacancies } from "@apply/db";
import type { Vacancy } from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { extractVacancy, extractVacancyFromImage } from "../llm.ts";
import { FAKE_TRANSCRIPTION, type FakeClaudeMode, useFakeClaude } from "../test/fake-claude.ts";
import { extracted } from "../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES } from "./image.ts";
import { createVacanciesRepository } from "./repository.ts";
import { vacancyRoutes } from "./routes.ts";

// Imagen de verdad no hace falta: el binario falso no la decodifica.
const PNG = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
const fetchText = vi.fn();
let iso: IsolatedDb;
let app: Hono;
let fake: ReturnType<typeof useFakeClaude> | undefined;

beforeAll(async () => {
  iso = await createIsolatedDb();
  app = new Hono().basePath("/api").route(
    "/",
    vacancyRoutes({
      repo: createVacanciesRepository(iso.db),
      fetchText,
      extract: extractVacancy,
      extractFromImage: extractVacancyFromImage,
      retrieve: async () => {
        throw new Error("no se usa");
      },
    }),
  );
});
afterAll(async () => {
  await iso.drop();
});
beforeEach(async () => {
  await iso.db.execute(sql`TRUNCATE vacancies, companies RESTART IDENTITY CASCADE`);
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
