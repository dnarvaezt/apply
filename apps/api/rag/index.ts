import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IndexStatus, MatchReport, Vacancy } from "@apply/shared";
import { type Db, getDb } from "../db.ts";
import { listFiles, mtime, PROFILE_DIR } from "../storage.ts";
import { type Chunk, chunkMarkdown } from "./chunk.ts";
import { EMBED_MODEL, embed } from "./embed.ts";
import { buildMatchReport, isStale, rankChunks, vacancyQueries } from "./match.ts";
import { createProfileChunksRepository, type FileChunks } from "./repository.ts";

export interface RagDeps {
  db: Db;
  profileDir: string;
  model: string;
  embed: (texts: string[], kind: "query" | "passage") => Promise<number[][]>;
}

interface ProfileFile {
  path: string;
  hash: string;
  mtime: Date;
  chunks: Chunk[];
}

/**
 * Índice RAG del perfil sobre `profile_chunks` (pgvector, D2). Los `.md` del perfil siguen
 * siendo la fuente; la ingesta es incremental por hash de archivo y por `embed_model`.
 */
export function createRagIndex(deps: RagDeps) {
  const repo = createProfileChunksRepository(deps.db);

  async function scan(): Promise<ProfileFile[]> {
    const names = await listFiles(deps.profileDir, ".md");
    return Promise.all(
      names.map(async (name) => {
        const full = path.join(deps.profileDir, name);
        const content = await readFile(full, "utf8");
        return {
          path: name,
          hash: createHash("sha256").update(content).digest("hex"),
          mtime: new Date(await mtime(full)),
          chunks: chunkMarkdown(name, content),
        };
      }),
    );
  }

  /** Solo los archivos con algún fragmento tienen filas; uno vacío no deja el índice desactualizado. */
  const indexable = (files: ProfileFile[]) => files.filter((f) => f.chunks.length > 0);

  async function status(files: ProfileFile[]): Promise<IndexStatus> {
    const current = new Map(indexable(files).map((f) => [f.path, f.hash]));
    const [stored, { chunks, builtAt }] = await Promise.all([repo.sources(), repo.summary()]);
    return {
      builtAt: builtAt?.toISOString() ?? null,
      files: files.length,
      chunks,
      stale: isStale(current, stored, deps.model),
      model: deps.model,
    };
  }

  async function getIndexStatus(): Promise<IndexStatus> {
    return status(await scan());
  }

  async function buildIndex(): Promise<IndexStatus> {
    const files = await scan();
    const wanted = indexable(files);
    const stored = await repo.sources();
    // Un archivo está al día si todas sus filas tienen su hash actual y el modelo actual.
    const outdated = new Set(stored.filter((s) => s.model !== deps.model).map((s) => s.path));
    const fresh = new Set(
      stored.filter((s) => !outdated.has(s.path)).map((s) => `${s.path}\0${s.hash}`),
    );
    const changed = wanted.filter((f) => !fresh.has(`${f.path}\0${f.hash}`));
    const keep = new Set(wanted.map((f) => f.path));
    const removed = [...new Set(stored.map((s) => s.path))].filter((p) => !keep.has(p));

    if (changed.length > 0 || removed.length > 0) {
      const all = changed.flatMap((f) => f.chunks);
      const vectors =
        all.length > 0
          ? await deps.embed(
              all.map((c) => `${c.heading}\n${c.text}`),
              "passage",
            )
          : [];
      let i = 0;
      const withVectors: FileChunks[] = changed.map((f) => ({
        ...f,
        chunks: f.chunks.map((c) => ({ ...c, vector: vectors[i++] })),
      }));
      await repo.replace(withVectors, removed, deps.model);
    }
    return status(files);
  }

  async function ensureFreshIndex(): Promise<IndexStatus> {
    const current = await getIndexStatus();
    return current.stale ? buildIndex() : current;
  }

  /**
   * Recupera la evidencia del perfil para una vacante: por cada requisito busca en pgvector
   * los fragmentos más parecidos, suma el bonus léxico y arma el contexto.
   */
  async function retrieveForVacancy(vacancy: Vacancy): Promise<MatchReport> {
    await ensureFreshIndex();
    const queries = vacancyQueries(vacancy);
    const qVectors = await deps.embed(
      queries.map((q) => q.text),
      "query",
    );
    const ranked = await Promise.all(
      queries.map(async (q, qi) =>
        rankChunks(q.text, await repo.similar(qVectors[qi], deps.model)),
      ),
    );
    return buildMatchReport(vacancy.id, queries, ranked, await repo.always(deps.model));
  }

  return { getIndexStatus, buildIndex, ensureFreshIndex, retrieveForVacancy };
}

let defaultIndex: ReturnType<typeof createRagIndex> | undefined;

/** Índice de la API: base de `DATABASE_URL`, perfil de `data/profile` y el modelo de `EMBED_MODEL`. */
function rag() {
  defaultIndex ??= createRagIndex({
    db: getDb(),
    profileDir: PROFILE_DIR,
    model: EMBED_MODEL,
    embed,
  });
  return defaultIndex;
}

export const getIndexStatus = () => rag().getIndexStatus();
export const buildIndex = () => rag().buildIndex();
export const ensureFreshIndex = () => rag().ensureFreshIndex();
export const retrieveForVacancy = (vacancy: Vacancy) => rag().retrieveForVacancy(vacancy);
