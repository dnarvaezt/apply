import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cvs, profileChunks, vacancies } from "#db";
import { APP_ROOT } from "../paths.ts";
import { EMBED_MODEL, embed } from "../rag/embed.ts";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { importLegacyData } from "./import-data.ts";

const run = promisify(execFile);

const vacancy = (id: string, title: string, language: "es" | "en") => ({
  id,
  createdAt: "2026-05-01T10:00:00.000Z",
  sourceUrl: null,
  rawText: `Descripción de ${title}`,
  title,
  company: "ACME",
  location: null,
  seniority: null,
  language,
  summary: "Resumen",
  mustHave: ["TypeScript"],
  niceToHave: [],
  responsibilities: [],
  keywords: [],
});

const FIXTURE: Record<string, string> = {
  "vacancies/2026-05-01-acme-backend-aaaaaa.json": JSON.stringify(
    vacancy("2026-05-01-acme-backend-aaaaaa", "Backend Importada", "en"),
  ),
  "vacancies/2026-05-02-acme-data-bbbbbb.json": JSON.stringify(
    vacancy("2026-05-02-acme-data-bbbbbb", "Datos Importada", "es"),
  ),
  "vacancies/rota.json": "{ esto no es json",
  "cvs/2026-05-03-acme-cccccc.json": JSON.stringify({
    id: "2026-05-03-acme-cccccc",
    vacancyId: "2026-05-01-acme-backend-aaaaaa",
    title: "CV Backend",
    createdAt: "2026-05-03T09:00:00.000Z",
    updatedAt: "2026-05-04T09:00:00.000Z",
  }),
  "cvs/2026-05-03-acme-cccccc.md": "# Ana Pérez\n\nBackend con TypeScript.\n",
  "cvs/2026-05-05-huerfano-dddddd.json": JSON.stringify({
    id: "2026-05-05-huerfano-dddddd",
    vacancyId: "2026-01-01-borrada-zzzzzz",
    title: "CV sin vacante",
    createdAt: "2026-05-05T09:00:00.000Z",
    updatedAt: "2026-05-05T09:00:00.000Z",
  }),
  "cvs/2026-05-05-huerfano-dddddd.md": "# Ana Pérez\n\nCV viejo.\n",
  "profile/10-experiencia.md":
    "# Experiencia\n\n## Backend en ACME\n\nAPIs con TypeScript y PostgreSQL.\n",
  "profile/20-idiomas.md": "# Idiomas\n\nEspañol nativo, inglés avanzado.\n",
};

let iso: IsolatedDb;
let dataDir: string;

const importOnce = () => importLegacyData({ db: iso.db, dataDir, model: EMBED_MODEL, embed });

async function hashes(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full)] = createHash("sha256")
      .update(await readFile(full))
      .digest("hex");
  }
  return out;
}

beforeAll(async () => {
  iso = await createIsolatedDb();
  await embed(["calentamiento"], "passage");
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "apply-import-"));
  for (const [name, content] of Object.entries(FIXTURE)) {
    await mkdir(path.dirname(path.join(dataDir, name)), { recursive: true });
    await writeFile(path.join(dataDir, name), content, "utf8");
  }
  await iso.db.delete(cvs);
  await iso.db.delete(vacancies);
  await iso.db.delete(profileChunks);
  return () => rm(dataDir, { recursive: true, force: true });
});

describe("importLegacyData", () => {
  it("AC-001: importa 2 vacantes y 2 CVs, conserva ids, fechas y relación, y reporta el JSON roto", async () => {
    const report = await importOnce();

    expect(report.vacancies).toEqual({ imported: 2, skipped: 0 });
    expect(report.cvs).toEqual({ imported: 2, skipped: 0 });
    expect(report.errors).toEqual([
      { file: "vacancies/rota.json", message: expect.stringMatching(/JSON inválido/) },
    ]);

    const vacancyRows = await iso.db
      .select({ id: vacancies.id, legacyId: vacancies.legacyId, createdAt: vacancies.createdAt })
      .from(vacancies)
      .orderBy(asc(vacancies.legacyId));
    expect(vacancyRows.map((r) => r.legacyId)).toEqual([
      "2026-05-01-acme-backend-aaaaaa",
      "2026-05-02-acme-data-bbbbbb",
    ]);
    expect(vacancyRows[0]?.createdAt).toEqual(new Date("2026-05-01T10:00:00.000Z"));

    const cvRows = await iso.db.select().from(cvs).orderBy(asc(cvs.legacyId));
    expect(cvRows.map((r) => [r.legacyId, r.vacancyId, r.language, r.title])).toEqual([
      ["2026-05-03-acme-cccccc", vacancyRows[0]?.id, "en", "CV Backend"],
      ["2026-05-05-huerfano-dddddd", null, "es", "CV sin vacante"],
    ]);
    expect(cvRows[0]?.content).toBe(FIXTURE["cvs/2026-05-03-acme-cccccc.md"]);
    expect(cvRows[0]?.createdAt).toEqual(new Date("2026-05-03T09:00:00.000Z"));
    expect(cvRows[0]?.updatedAt).toEqual(new Date("2026-05-04T09:00:00.000Z"));
  });

  it("AC-002: una segunda ejecución omite todo y mantiene los conteos", async () => {
    await importOnce();
    const second = await importOnce();

    expect(second.vacancies).toEqual({ imported: 0, skipped: 2 });
    expect(second.cvs).toEqual({ imported: 0, skipped: 2 });
    expect(await iso.db.$count(vacancies)).toBe(2);
    expect(await iso.db.$count(cvs)).toBe(2);
  });

  it("AC-003: no modifica ni borra ningún archivo de data/", async () => {
    const before = await hashes(dataDir);
    await importOnce();
    expect(await hashes(dataDir)).toEqual(before);
  });

  it("AC-004: reconstruye profile_chunks desde data/profile", async () => {
    const report = await importOnce();
    const rows = await iso.db
      .selectDistinct({ path: profileChunks.sourcePath })
      .from(profileChunks)
      .orderBy(asc(profileChunks.sourcePath));
    expect(rows.map((r) => r.path)).toEqual(["10-experiencia.md", "20-idiomas.md"]);
    expect(report.profile.chunks).toBe(await iso.db.$count(profileChunks));
    expect(report.profile.chunks).toBeGreaterThan(0);
  });

  it("reporta un CV sin su markdown como error sin abortar el resto", async () => {
    await rm(path.join(dataDir, "cvs/2026-05-05-huerfano-dddddd.md"));
    const report = await importOnce();
    expect(report.cvs).toEqual({ imported: 1, skipped: 0 });
    expect(report.errors.map((e) => e.file)).toEqual([
      "vacancies/rota.json",
      "cvs/2026-05-05-huerfano-dddddd.json",
    ]);
  });
});

describe("npm run db:import", () => {
  it("AC-001/REQ-006: imprime los conteos y sale con código distinto de 0 si hubo errores", async () => {
    const result = await run("npm", ["run", "--silent", "db:import"], {
      cwd: APP_ROOT,
      env: { ...process.env, DATABASE_URL: iso.url, CV_DATA_DIR: dataDir },
    }).then(
      () => ({ code: 0, stdout: "" }),
      (error: { code: number; stdout: string }) => error,
    );

    expect(result.code).not.toBe(0);
    expect(result.stdout).toContain("Vacantes: 2 importadas, 0 omitidas");
    expect(result.stdout).toContain("CVs: 2 importados, 0 omitidos");
    expect(result.stdout).toContain("Errores: 1");
    expect(result.stdout).toContain("vacancies/rota.json");
  });
});
