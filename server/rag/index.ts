import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  IndexStatus,
  MatchLevel,
  MatchReport,
  RequirementMatch,
  RetrievedChunk,
  Vacancy,
} from "../../shared/types.ts";
import { INDEX_FILE, listFiles, mtime, PROFILE_DIR, readJson, writeJson } from "../storage.ts";
import { type Chunk, chunkMarkdown } from "./chunk.ts";
import { cosine, EMBED_MODEL, embed } from "./embed.ts";

interface StoredChunk extends Chunk {
  vector: number[];
}

interface StoredIndex {
  model: string;
  builtAt: string;
  fileMtimes: Record<string, number>;
  chunks: StoredChunk[];
}

/** Archivos con este prefijo siempre entran al contexto (contacto, resumen base). */
const ALWAYS_PREFIX = "00-";
const TOP_PER_QUERY = 3;
const MAX_CONTEXT_CHUNKS = 30;

// Umbrales calibrados para multilingual-e5-small (similitudes comprimidas en ~0.7–0.95)
const STRONG = 0.88;
const PARTIAL = 0.835;

let cache: StoredIndex | null = null;

async function loadIndex(): Promise<StoredIndex | null> {
  cache ??= await readJson<StoredIndex>(INDEX_FILE);
  return cache;
}

async function currentMtimes(): Promise<Record<string, number>> {
  const files = await listFiles(PROFILE_DIR, ".md");
  const out: Record<string, number> = {};
  for (const f of files) out[f] = await mtime(path.join(PROFILE_DIR, f));
  return out;
}

export async function getIndexStatus(): Promise<IndexStatus> {
  const index = await loadIndex();
  const mtimes = await currentMtimes();
  const stale =
    !index ||
    index.model !== EMBED_MODEL ||
    Object.keys(mtimes).length !== Object.keys(index.fileMtimes).length ||
    Object.entries(mtimes).some(([f, m]) => index.fileMtimes[f] !== m);
  return {
    builtAt: index?.builtAt ?? null,
    files: Object.keys(mtimes).length,
    chunks: index?.chunks.length ?? 0,
    stale,
    model: EMBED_MODEL,
  };
}

export async function buildIndex(): Promise<IndexStatus> {
  const mtimes = await currentMtimes();
  const chunks: Chunk[] = [];
  for (const file of Object.keys(mtimes)) {
    const content = await readFile(path.join(PROFILE_DIR, file), "utf8");
    chunks.push(...chunkMarkdown(file, content));
  }
  const vectors = await embed(
    chunks.map((c) => `${c.heading}\n${c.text}`),
    "passage",
  );
  cache = {
    model: EMBED_MODEL,
    builtAt: new Date().toISOString(),
    fileMtimes: mtimes,
    chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })),
  };
  await writeJson(INDEX_FILE, cache);
  return getIndexStatus();
}

export async function ensureFreshIndex(): Promise<StoredIndex> {
  const status = await getIndexStatus();
  if (status.stale) await buildIndex();
  const index = await loadIndex();
  if (!index) throw new Error("No se pudo construir el índice");
  return index;
}

function level(score: number): MatchLevel {
  if (score >= STRONG) return "fuerte";
  if (score >= PARTIAL) return "parcial";
  return "débil";
}

/** Bonus léxico: fracción de términos de la consulta que aparecen literalmente en el chunk. */
function lexical(query: string, text: string): number {
  const terms = normalize(query)
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length >= 3);
  if (terms.length === 0) return 0;
  const haystack = normalize(text);
  return terms.filter((t) => haystack.includes(t)).length / terms.length;
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Recupera la evidencia del perfil para una vacante: por cada requisito busca los chunks
 * más parecidos (búsqueda híbrida: embeddings + coincidencia literal) y arma el contexto.
 */
export async function retrieveForVacancy(vacancy: Vacancy): Promise<MatchReport> {
  const index = await ensureFreshIndex();

  const queries: { text: string; kind: "must" | "nice" | "other" }[] = [
    ...vacancy.mustHave.map((text) => ({ text, kind: "must" as const })),
    ...vacancy.niceToHave.map((text) => ({ text, kind: "nice" as const })),
    ...vacancy.responsibilities.map((text) => ({ text, kind: "other" as const })),
    { text: `${vacancy.title}. ${vacancy.summary}`, kind: "other" },
  ];
  const qVectors = await embed(
    queries.map((q) => q.text),
    "query",
  );

  const best = new Map<string, number>();
  const requirements: RequirementMatch[] = [];

  queries.forEach((q, qi) => {
    const scored = index.chunks
      .map((c) => {
        const sem = cosine(qVectors[qi], c.vector);
        const lex = lexical(q.text, `${c.heading} ${c.text}`);
        return { c, score: sem + 0.06 * lex };
      })
      .sort((a, b) => b.score - a.score);

    for (const { c, score } of scored.slice(0, TOP_PER_QUERY)) {
      best.set(c.id, Math.max(best.get(c.id) ?? 0, score));
    }

    if (q.kind !== "other") {
      const top = scored[0];
      const lvl = top ? level(top.score) : "débil";
      requirements.push({
        requirement: q.text,
        kind: q.kind,
        score: top ? round(top.score) : 0,
        level: lvl,
        evidence: top && lvl !== "débil" ? { file: top.c.file, heading: top.c.heading } : null,
      });
    }
  });

  const byId = new Map(index.chunks.map((c) => [c.id, c]));
  const selected: RetrievedChunk[] = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map(([id, score]) => toRetrieved(byId.get(id) as StoredChunk, score));

  for (const c of index.chunks) {
    if (c.file.startsWith(ALWAYS_PREFIX) && !selected.some((s) => s.id === c.id)) {
      selected.unshift(toRetrieved(c, 1));
    }
  }

  const must = requirements.filter((r) => r.kind === "must");
  const weight = { fuerte: 1, parcial: 0.5, débil: 0 } as const;
  const coverage = must.length
    ? must.reduce((acc, r) => acc + weight[r.level], 0) / must.length
    : 1;

  return { vacancyId: vacancy.id, coverage: round(coverage), requirements, chunks: selected };
}

function toRetrieved(c: StoredChunk, score: number): RetrievedChunk {
  return { id: c.id, file: c.file, heading: c.heading, text: c.text, score: round(score) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
