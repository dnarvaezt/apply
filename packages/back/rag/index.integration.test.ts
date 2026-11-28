import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Vacancy } from "@apply/shared";
import { asc, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { profileChunks } from "#db";
import { createIsolatedDb, type IsolatedDb } from "../test/test-db.ts";
import { EMBED_MODEL, embed } from "./embed.ts";
import { createRagIndex } from "./index.ts";
import { level, PARTIAL, STRONG } from "./match.ts";

const PROFILE = {
  "00-contacto.md": "# Contacto\n\nAna Pérez, ana@example.com, Bogotá.\n",
  "10-experiencia.md": [
    "# Experiencia",
    "",
    "## Backend en ACME",
    "",
    "Diseñé APIs REST con TypeScript, Node.js y PostgreSQL para pagos en línea.",
    "",
    "## Datos en Globex",
    "",
    "Construí pipelines de datos con Python y Airflow.",
    "",
  ].join("\n"),
  "20-idiomas.md": "# Idiomas\n\nEspañol nativo, inglés avanzado.\n",
};

let iso: IsolatedDb;
let dir: string;
let embedCalls: number;

function rag(model = EMBED_MODEL) {
  return createRagIndex({
    db: iso.db,
    profileDir: dir,
    model,
    embed: async (texts, kind) => {
      embedCalls++;
      return embed(texts, kind);
    },
  });
}

async function rows() {
  return iso.db
    .select()
    .from(profileChunks)
    .orderBy(asc(profileChunks.sourcePath), asc(profileChunks.chunkIndex));
}

beforeAll(async () => {
  iso = await createIsolatedDb();
  // Carga el modelo local (y lo descarga la primera vez) fuera del tiempo de cada prueba.
  await embed(["calentamiento"], "passage");
});

afterAll(async () => {
  await iso.drop();
});

beforeEach(async () => {
  await iso.db.execute(sql`TRUNCATE profile_chunks RESTART IDENTITY`);
  dir = await mkdtemp(path.join(tmpdir(), "apply-rag-"));
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(PROFILE)) {
    await writeFile(path.join(dir, name), content, "utf8");
  }
  embedCalls = 0;
  return () => rm(dir, { recursive: true, force: true });
});

describe("índice RAG en pgvector", () => {
  it("AC-001: guarda un fragmento por sección con vector de 384 y embed_model", async () => {
    const status = await rag().buildIndex();

    const stored = await rows();
    expect(stored.map((r) => [r.sourcePath, r.chunkIndex, r.content])).toEqual([
      ["00-contacto.md", 0, "Contacto\nAna Pérez, ana@example.com, Bogotá."],
      [
        "10-experiencia.md",
        0,
        "Experiencia > Backend en ACME\nDiseñé APIs REST con TypeScript, Node.js y PostgreSQL para pagos en línea.",
      ],
      [
        "10-experiencia.md",
        1,
        "Experiencia > Datos en Globex\nConstruí pipelines de datos con Python y Airflow.",
      ],
      ["20-idiomas.md", 0, "Idiomas\nEspañol nativo, inglés avanzado."],
    ]);
    for (const r of stored) {
      expect(r.embedding).toHaveLength(384);
      expect(r.embedModel).toBe(EMBED_MODEL);
      expect(r.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.sourceMtime).toBeInstanceOf(Date);
    }
    expect(status).toMatchObject({ files: 3, chunks: 4, stale: false, model: EMBED_MODEL });
    expect(status.builtAt).not.toBeNull();
  });

  it("AC-002: reconstruir sin cambios no llama a embed", async () => {
    await rag().buildIndex();
    expect(embedCalls).toBe(1);
    const before = await rows();

    await rag().buildIndex();
    expect(embedCalls).toBe(1);
    expect(await rows()).toEqual(before);
  });

  it("AC-003: al modificar un archivo solo cambian sus filas", async () => {
    await rag().buildIndex();
    const before = await rows();

    await writeFile(path.join(dir, "20-idiomas.md"), "# Idiomas\n\nEspañol, inglés y francés.\n");
    await rag().buildIndex();
    const after = await rows();

    const untouched = (rs: typeof before) => rs.filter((r) => r.sourcePath !== "20-idiomas.md");
    expect(untouched(after)).toEqual(untouched(before));
    const [oldRow] = before.filter((r) => r.sourcePath === "20-idiomas.md");
    const [newRow] = after.filter((r) => r.sourcePath === "20-idiomas.md");
    expect(newRow.content).toBe("Idiomas\nEspañol, inglés y francés.");
    expect(newRow.sourceHash).not.toBe(oldRow.sourceHash);
    expect(embedCalls).toBe(2);
  });

  it("dos construcciones simultáneas no chocan y dejan una sola copia de cada fragmento", async () => {
    // La vacante y el CV piden el índice a la vez (E2E de #19): sin serializar, la segunda
    // transacción insertaba los mismos (source_path, chunk_index) y violaba el índice único.
    const [a, b] = await Promise.all([rag().buildIndex(), rag().buildIndex()]);
    expect(a).toMatchObject({ files: 3, chunks: 4, stale: false });
    expect(b).toMatchObject({ files: 3, chunks: 4, stale: false });
    expect((await rows()).map((r) => [r.sourcePath, r.chunkIndex])).toEqual([
      ["00-contacto.md", 0],
      ["10-experiencia.md", 0],
      ["10-experiencia.md", 1],
      ["20-idiomas.md", 0],
    ]);
  });

  it("borra las filas de un archivo eliminado del perfil", async () => {
    await rag().buildIndex();
    await unlink(path.join(dir, "20-idiomas.md"));
    const status = await rag().buildIndex();
    expect((await rows()).map((r) => r.sourcePath)).not.toContain("20-idiomas.md");
    expect(status).toMatchObject({ files: 2, chunks: 3, stale: false });
    expect(embedCalls).toBe(1);
  });

  it("AC-004: getIndexStatus marca stale con otro EMBED_MODEL y tras borrar un archivo", async () => {
    expect(await rag().getIndexStatus()).toMatchObject({ stale: true, builtAt: null, chunks: 0 });
    await rag().buildIndex();
    expect((await rag().getIndexStatus()).stale).toBe(false);

    expect(await rag("otro/modelo").getIndexStatus()).toMatchObject({
      stale: true,
      model: "otro/modelo",
    });

    await unlink(path.join(dir, "20-idiomas.md"));
    expect(await rag().getIndexStatus()).toMatchObject({ stale: true, files: 2 });
  });

  it("marca stale al agregar o modificar un archivo", async () => {
    await rag().buildIndex();
    await writeFile(path.join(dir, "30-extra.md"), "# Extra\n\nAlgo nuevo.\n");
    expect((await rag().getIndexStatus()).stale).toBe(true);
    await rag().buildIndex();
    await writeFile(path.join(dir, "30-extra.md"), "# Extra\n\nAlgo distinto.\n");
    expect((await rag().getIndexStatus()).stale).toBe(true);
  });

  it("un archivo sin contenido indexable no deja el índice desactualizado", async () => {
    await writeFile(path.join(dir, "40-vacio.md"), "# Solo título\n");
    const status = await rag().buildIndex();
    expect(status).toMatchObject({ files: 4, chunks: 4, stale: false });
  });

  it("AC-005: retrieveForVacancy devuelve los niveles esperados y respeta STRONG y PARTIAL", async () => {
    const vacancy = {
      id: "42",
      title: "Desarrollador backend",
      summary: "APIs de pagos",
      mustHave: [
        "Diseño de APIs REST con TypeScript, Node.js y PostgreSQL",
        "Soldadura submarina certificada",
        "Experiencia en cocina gourmet francesa",
      ],
      niceToHave: ["Pipelines de datos con Python y Airflow"],
      responsibilities: ["Mantener servicios de pagos"],
    } as Vacancy;

    // Sin construir antes: la recuperación indexa sola si el índice está desactualizado.
    const report = await rag().retrieveForVacancy(vacancy);

    expect(report.vacancyId).toBe("42");
    expect(report.requirements.map((r) => [r.requirement, r.kind, r.level])).toEqual([
      ["Diseño de APIs REST con TypeScript, Node.js y PostgreSQL", "must", "fuerte"],
      ["Soldadura submarina certificada", "must", "débil"],
      ["Experiencia en cocina gourmet francesa", "must", "parcial"],
      ["Pipelines de datos con Python y Airflow", "nice", "fuerte"],
    ]);
    for (const r of report.requirements) {
      expect(r.level).toBe(level(r.score));
      if (r.level === "fuerte") expect(r.score).toBeGreaterThanOrEqual(STRONG);
      if (r.level === "parcial") {
        expect(r.score).toBeGreaterThanOrEqual(PARTIAL);
        expect(r.score).toBeLessThan(STRONG);
      }
      if (r.level === "débil") expect(r.score).toBeLessThan(PARTIAL);
    }
    expect(report.requirements[0].evidence).toEqual({
      file: "10-experiencia.md",
      heading: "Experiencia > Backend en ACME",
    });
    expect(report.requirements[1].evidence).toBeNull();
    expect(report.coverage).toBe(0.5);
    // Los fragmentos `00-` siempre están en el contexto, aunque ninguna consulta los elija.
    expect(report.chunks.map((c) => c.id)).toEqual(
      expect.arrayContaining(["00-contacto.md#0", "10-experiencia.md#0"]),
    );
    expect(new Set(report.chunks.map((c) => c.id)).size).toBe(report.chunks.length);
  });
});
