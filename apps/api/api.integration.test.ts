import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { CvDoc, CvMeta, MatchReport, Vacancy } from "@apply/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCvsRepository } from "./cvs/repository.ts";
import { cvRoutes } from "./cvs/routes.ts";
import { DATA_DIR } from "./storage.ts";
import { extracted } from "./test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "./test/test-db.ts";
import { createVacanciesRepository } from "./vacancies/repository.ts";
import { vacancyRoutes } from "./vacancies/routes.ts";

// Los esquemas se anotan con los tipos de @apply/shared: si el contrato cambia, no compila.
const vacancySchema: z.ZodType<Vacancy> = z.strictObject({
  id: z.string(),
  createdAt: z.iso.datetime(),
  sourceUrl: z.string().nullable(),
  rawText: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  seniority: z.string().nullable(),
  language: z.enum(["es", "en"]),
  summary: z.string(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
  platform: z.string(),
  posterName: z.string().nullable(),
  posterTitle: z.string().nullable(),
  posterProfileUrl: z.string().nullable(),
  postedAt: z.iso.datetime().nullable(),
  postedAtPrecision: z.enum(["exact", "relative", "unknown"]),
});
const cvMetaShape = {
  id: z.string(),
  vacancyId: z.string().nullable(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
const cvMetaSchema: z.ZodType<CvMeta> = z.strictObject(cvMetaShape);
const cvDocSchema: z.ZodType<CvDoc> = z.strictObject({ ...cvMetaShape, markdown: z.string() });

const REPORT: MatchReport = { vacancyId: "x", coverage: 1, requirements: [], chunks: [] };
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const LONG_TEXT = "Buscamos un ingeniero backend con experiencia en TypeScript y Postgres. ".repeat(
  3,
);

let iso: IsolatedDb;
let app: Hono;
const fetchText = vi.fn(async (_url: string) => ({
  text: LONG_TEXT,
  postedAt: null as string | null,
  company: null as string | null,
}));
const extract = vi.fn(async (_text: string) => extracted());
const renderPdf = vi.fn(async (_md: string, _title: string) => PDF);

beforeAll(async () => {
  iso = await createIsolatedDb();
  const vacancies = createVacanciesRepository(iso.db);
  const cvs = createCvsRepository(iso.db);
  const retrieve = async (v: Vacancy) => ({ ...REPORT, vacancyId: v.id });
  app = new Hono()
    .basePath("/api")
    .route("/", vacancyRoutes({ repo: vacancies, fetchText, extract, retrieve }))
    .route(
      "/",
      cvRoutes({
        repo: cvs,
        getVacancy: (id) => vacancies.get(id),
        retrieve,
        streamCv: async function* () {
          yield "```markdown\n# Ana\n";
          yield "**Dev**\n```";
        },
        cleanMarkdown: (md) => md.replace(/```(markdown)?/g, "").trim(),
        renderPdf,
      }),
    );
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(
    sql`TRUNCATE match_reports, cvs, vacancies, companies RESTART IDENTITY CASCADE`,
  );
  vi.clearAllMocks();
});

const call = (method: string, url: string, body?: unknown) =>
  app.request(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function createVacancy(body: Record<string, unknown> = { text: LONG_TEXT }) {
  const res = await call("POST", "/vacancies", body);
  return { res, body: (await res.json()) as Vacancy };
}

async function generateCv(vacancyId: string): Promise<CvDoc> {
  const res = await call("POST", "/cvs/generate", { vacancyId, instructions: "corto" });
  const text = await res.text();
  const done = text.match(/event: done\ndata: (.*)/)?.[1];
  if (!done) throw new Error(`sin evento done: ${text}`);
  return JSON.parse(done) as CvDoc;
}

describe("API de vacantes (AC-003)", () => {
  it("POST, GET y listado responden con el contrato de @apply/shared", async () => {
    const { res, body } = await createVacancy({ text: LONG_TEXT, url: "https://example.com/j" });
    expect(res.status).toBe(200);
    expect(vacancySchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({ sourceUrl: "https://example.com/j", company: "ACME S.A." });
    expect(extract).toHaveBeenCalledWith(LONG_TEXT.trim());

    const one = await call("GET", `/vacancies/${body.id}`);
    expect(vacancySchema.parse(await one.json())).toEqual(body);

    const list = await call("GET", "/vacancies");
    const items = z.array(vacancySchema).parse(await list.json());
    expect(items).toEqual([body]);
  });

  it("descarga el texto de la URL cuando no hay texto pegado", async () => {
    const { body } = await createVacancy({ url: "https://example.com/j" });
    expect(fetchText).toHaveBeenCalledWith("https://example.com/j");
    expect(body.rawText).toBe(LONG_TEXT);
  });

  it("rechaza texto corto con el mismo mensaje y 400", async () => {
    const res = await call("POST", "/vacancies", { text: "corto" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pega el texto de la vacante o una URL válida" });
  });

  it("404 con el mensaje de siempre para ids inexistentes o inválidos", async () => {
    for (const id of ["999", "2026-01-01-viejo-abc123"]) {
      const res = await call("GET", `/vacancies/${id}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Vacante no encontrada" });
      expect((await call("GET", `/vacancies/${id}/match`)).status).toBe(404);
    }
  });

  it("match devuelve el informe de la vacante", async () => {
    const { body } = await createVacancy();
    const res = await call("GET", `/vacancies/${body.id}/match`);
    expect(await res.json()).toEqual({ ...REPORT, vacancyId: body.id });
  });

  it("DELETE responde { ok: true } exista o no (REQ-006)", async () => {
    const { body } = await createVacancy();
    for (const id of [body.id, body.id, "nope"]) {
      const res = await call("DELETE", `/vacancies/${id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect((await call("GET", `/vacancies/${body.id}`)).status).toBe(404);
  });
});

describe("poster, fecha y plataforma de la vacante (#15)", () => {
  const LINKEDIN_TEXT = `${LONG_TEXT}\nMeet the hiring team\nLaura Gómez · Technical Recruiter\nVer en LinkedIn`;

  it("guarda poster y fecha relativa extraídos, calculada desde la creación (REQ-001/002)", async () => {
    extract.mockResolvedValueOnce(
      extracted({
        posterName: "Laura Gómez",
        posterTitle: "Technical Recruiter",
        postedAtText: "hace 3 días",
      }),
    );
    const { body } = await createVacancy({ text: LINKEDIN_TEXT });
    expect(body).toMatchObject({
      posterName: "Laura Gómez",
      posterTitle: "Technical Recruiter",
      posterProfileUrl: null,
      postedAtPrecision: "relative",
    });
    const days = (Date.parse(body.createdAt) - Date.parse(body.postedAt as string)) / 86_400_000;
    expect(days).toBe(3);
  });

  it("sin fecha disponible queda NULL con precisión unknown (REQ-004)", async () => {
    const { body } = await createVacancy();
    expect(body).toMatchObject({ postedAt: null, postedAtPrecision: "unknown", posterName: null });
  });

  it("una vacante pegada con texto de LinkedIn queda con plataforma linkedin (AC-006)", async () => {
    const { body } = await createVacancy({ text: LINKEDIN_TEXT });
    expect(body.platform).toBe("linkedin");
    const [row] = await iso.db.execute(
      sql`SELECT p.slug FROM vacancies v JOIN platforms p ON p.id = v.platform_id`,
    );
    expect(row?.slug).toBe("linkedin");
  });

  it("otra plataforma o texto sin pistas queda manual (REQ-006)", async () => {
    const { body } = await createVacancy({ text: LONG_TEXT, url: "https://example.com/j" });
    expect(body.platform).toBe("manual");
  });

  it("datePosted y hiringOrganization del JSON-LD alimentan fecha exacta y empresa (REQ-003)", async () => {
    fetchText.mockResolvedValueOnce({ text: LONG_TEXT, postedAt: "2026-03-01", company: "Globex" });
    extract.mockResolvedValueOnce(extracted({ postedAtText: "hace 3 días" }));
    const { body } = await createVacancy({ url: "https://example.com/j" });
    expect(body).toMatchObject({
      company: "Globex",
      postedAt: "2026-03-01T00:00:00.000Z",
      postedAtPrecision: "exact",
    });
  });

  it("los valores manuales al crear reemplazan a los extraídos (AC-004)", async () => {
    extract.mockResolvedValueOnce(
      extracted({ posterName: "Extraída", posterTitle: "Recruiter", postedAtText: "hace 3 días" }),
    );
    const { body } = await createVacancy({
      text: LONG_TEXT,
      posterName: "Manual",
      posterProfileUrl: "https://www.linkedin.com/in/manual",
      postedAt: "2026-02-10",
    });
    expect(body).toMatchObject({
      posterName: "Manual",
      posterTitle: "Recruiter",
      posterProfileUrl: "https://www.linkedin.com/in/manual",
      postedAt: "2026-02-10T00:00:00.000Z",
      postedAtPrecision: "exact",
    });
  });

  it("PATCH corrige poster y fecha y persiste (AC-004 / REQ-005)", async () => {
    extract.mockResolvedValueOnce(
      extracted({ posterName: "Extraída", posterTitle: "Recruiter", postedAtText: "hace 3 días" }),
    );
    const { body: created } = await createVacancy();
    const res = await call("PATCH", `/vacancies/${created.id}`, {
      posterName: "Corregida",
      posterTitle: "",
      postedAt: "2026-03-05",
    });
    expect(res.status).toBe(200);
    const updated = vacancySchema.parse(await res.json());
    expect(updated).toMatchObject({
      posterName: "Corregida",
      posterTitle: null,
      postedAt: "2026-03-05T00:00:00.000Z",
      postedAtPrecision: "exact",
    });
    expect(await (await call("GET", `/vacancies/${created.id}`)).json()).toEqual(updated);
  });

  it("PATCH de una vacante inexistente responde 404", async () => {
    const res = await call("PATCH", "/vacancies/999", { posterName: "x" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vacante no encontrada" });
  });

  it.each(["POST", "PATCH"])(
    "%s rechaza posterProfileUrl javascript: con 400 sin descargar nada (AC-005 / REQ-007)",
    async (method) => {
      const { body: created } = await createVacancy();
      fetchText.mockClear();
      const url = method === "POST" ? "/vacancies" : `/vacancies/${created.id}`;
      const res = await call(method, url, {
        url: "https://example.com/j",
        posterProfileUrl: "javascript:alert(1)",
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "posterProfileUrl debe ser una URL http o https" });
      expect(fetchText).not.toHaveBeenCalled();
      expect((await call("GET", `/vacancies/${created.id}`)).status).toBe(200);
    },
  );

  it("400 con fecha manual inválida o cuerpo que no es objeto", async () => {
    const bad = await call("POST", "/vacancies", { text: LONG_TEXT, postedAt: "ayer" });
    expect(bad.status).toBe(400);
    const notJson = await app.request("/api/vacancies", { method: "POST", body: "no json" });
    expect(notJson.status).toBe(400);
  });
});

describe("API de CVs (AC-003)", () => {
  it("genera por SSE, guarda y sirve el contrato de @apply/shared", async () => {
    const { body: vacancy } = await createVacancy();
    const res = await call("POST", "/cvs/generate", { vacancyId: vacancy.id });
    const text = await res.text();
    expect(text).toContain("event: status");
    expect(text).toContain("event: match");
    expect(text.match(/event: delta/g)).toHaveLength(2);

    const doc = await generateCv(vacancy.id);
    expect(cvDocSchema.parse(doc)).toEqual(doc);
    expect(doc).toMatchObject({
      vacancyId: vacancy.id,
      title: "Ingeniero Backend — ACME S.A.",
      markdown: "# Ana\n**Dev**",
    });

    const list = z.array(cvMetaSchema).parse(await (await call("GET", "/cvs")).json());
    expect(list).toHaveLength(2);
    const got = cvDocSchema.parse(await (await call("GET", `/cvs/${doc.id}`)).json());
    expect(got).toEqual(doc);
  });

  it("generate responde 404 si la vacante no existe", async () => {
    const res = await call("POST", "/cvs/generate", { vacancyId: "999" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Vacante no encontrada" });
  });

  it("PUT edita markdown y título; 404 si no existe", async () => {
    const { body: vacancy } = await createVacancy();
    const doc = await generateCv(vacancy.id);
    const res = await call("PUT", `/cvs/${doc.id}`, { markdown: "# Editado", title: " Nuevo " });
    const updated = cvDocSchema.parse(await res.json());
    expect(updated).toMatchObject({ id: doc.id, markdown: "# Editado", title: "Nuevo" });

    const missing = await call("PUT", "/cvs/999", { markdown: "x" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "CV no encontrado" });
  });

  it("DELETE responde { ok: true }; GET posterior da 404", async () => {
    const { body: vacancy } = await createVacancy();
    const doc = await generateCv(vacancy.id);
    for (const id of [doc.id, doc.id]) {
      const res = await call("DELETE", `/cvs/${id}`);
      expect(await res.json()).toEqual({ ok: true });
    }
    const gone = await call("GET", `/cvs/${doc.id}`);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "CV no encontrado" });
  });

  it("borrar la vacante conserva el CV con vacancyId null", async () => {
    const { body: vacancy } = await createVacancy();
    const doc = await generateCv(vacancy.id);
    await call("DELETE", `/vacancies/${vacancy.id}`);
    const got = cvDocSchema.parse(await (await call("GET", `/cvs/${doc.id}`)).json());
    expect(got.vacancyId).toBeNull();
  });
});

async function snapshot(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { recursive: true })).sort();
  } catch {
    return [];
  }
}

describe("sin archivos en data/ (AC-004 / REQ-001 / REQ-004)", () => {
  it("crear, generar, editar, descargar el PDF y borrar no escribe en vacancies/ ni cvs/", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const before = await snapshot(DATA_DIR);

    const { body: vacancy } = await createVacancy();
    const doc = await generateCv(vacancy.id);
    await call("PUT", `/cvs/${doc.id}`, { markdown: "# Editado" });

    const pdfRes = await call("GET", `/cvs/${doc.id}/pdf`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdfRes.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="CV-.+\.pdf"$/,
    );
    expect(new Uint8Array(await pdfRes.arrayBuffer())).toEqual(PDF);
    expect(renderPdf).toHaveBeenCalledWith("# Editado", doc.title);

    await call("DELETE", `/cvs/${doc.id}`);
    await call("DELETE", `/vacancies/${vacancy.id}`);

    expect(await snapshot(DATA_DIR)).toEqual(before);
    expect(await snapshot(path.join(DATA_DIR, "vacancies"))).toEqual([]);
    expect(await snapshot(path.join(DATA_DIR, "cvs"))).toEqual([]);
  });

  it("GET /cvs/:id/pdf regenera en cada descarga y no crea archivos", async () => {
    const { body: vacancy } = await createVacancy();
    const doc = await generateCv(vacancy.id);
    const before = await snapshot(DATA_DIR);
    await call("GET", `/cvs/${doc.id}/pdf`);
    await call("GET", `/cvs/${doc.id}/pdf`);
    expect(renderPdf).toHaveBeenCalledTimes(2);
    expect(await snapshot(DATA_DIR)).toEqual(before);
  });

  it("el PDF de un CV inexistente responde 404", async () => {
    const res = await call("GET", "/cvs/999/pdf");
    expect(res.status).toBe(404);
    expect(renderPdf).not.toHaveBeenCalled();
  });
});
