import type {
  MatchLevel,
  MatchReport,
  MatchWeights,
  RequirementMatch,
  RetrievedChunk,
  Vacancy,
} from "@apply/shared";
import type { Chunk } from "./chunk.ts";

/** Archivos con este prefijo siempre entran al contexto (contacto, resumen base). */
export const ALWAYS_PREFIX = "00-";
const TOP_PER_QUERY = 3;
const MAX_CONTEXT_CHUNKS = 30;
const LEXICAL_WEIGHT = 0.06;

// Umbrales calibrados para multilingual-e5-small (similitudes comprimidas en ~0.7–0.95)
export const STRONG = 0.88;
export const PARTIAL = 0.835;

export type QueryKind = "must" | "nice" | "other";
export interface Query {
  text: string;
  kind: QueryKind;
}
export interface Scored {
  c: Chunk;
  score: number;
}

/** Peso de cada nivel en la cobertura ponderada de `mustHave` (D6). */
export const MATCH_WEIGHTS: MatchWeights = { fuerte: 1, parcial: 0.5, débil: 0 };

/** Promedio de los pesos de los niveles de `mustHave`; 1 si la vacante no tiene ninguno. */
export function weightedCoverage(mustLevels: MatchLevel[]): number {
  if (mustLevels.length === 0) return 1;
  return round(mustLevels.reduce((acc, l) => acc + MATCH_WEIGHTS[l], 0) / mustLevels.length);
}

/** Similitud coseno de dos vectores ya normalizados (los de `embed`). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/** Puntaje mínimo de cada nivel; la calibración (#25) prueba otros sin tocar los vigentes. */
export interface Thresholds {
  strong: number;
  partial: number;
}

export function levelWith(score: number, { strong, partial }: Thresholds): MatchLevel {
  if (score >= strong) return "fuerte";
  if (score >= partial) return "parcial";
  return "débil";
}

export function level(score: number): MatchLevel {
  return levelWith(score, { strong: STRONG, partial: PARTIAL });
}

/** Bonus léxico: fracción de términos de la consulta que aparecen literalmente en el chunk. */
export function lexical(query: string, text: string): number {
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
 * `profile_chunks.content` guarda el texto que se embebe: encabezado en la primera línea
 * (nunca tiene saltos: sale de una línea `#` o del nombre del archivo) y el cuerpo después.
 */
export function toContent(c: Pick<Chunk, "heading" | "text">): string {
  return `${c.heading}\n${c.text}`;
}

export function fromContent(content: string): Pick<Chunk, "heading" | "text"> {
  const nl = content.indexOf("\n");
  if (nl === -1) return { heading: content, text: "" };
  return { heading: content.slice(0, nl), text: content.slice(nl + 1) };
}

/**
 * El índice está desactualizado si el conjunto de archivos indexables o algún hash difiere
 * del guardado, o si alguna fila se embebió con otro modelo.
 */
export function isStale(
  current: Map<string, string>,
  stored: { path: string; hash: string; model: string }[],
  model: string,
): boolean {
  if (stored.some((s) => s.model !== model)) return true;
  if (stored.length !== current.size) return true;
  return stored.some((s) => current.get(s.path) !== s.hash);
}

export function vacancyQueries(vacancy: Vacancy): Query[] {
  return [
    ...vacancy.mustHave.map((text) => ({ text, kind: "must" as const })),
    ...vacancy.niceToHave.map((text) => ({ text, kind: "nice" as const })),
    ...vacancy.responsibilities.map((text) => ({ text, kind: "other" as const })),
    { text: `${vacancy.title}. ${vacancy.summary}`, kind: "other" },
  ];
}

/** Búsqueda híbrida: similitud coseno (de pgvector) + coincidencia literal. */
export function rankChunks(query: string, candidates: { chunk: Chunk; sem: number }[]): Scored[] {
  return candidates
    .map(({ chunk, sem }) => ({
      c: chunk,
      score: sem + LEXICAL_WEIGHT * lexical(query, `${chunk.heading} ${chunk.text}`),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Arma el reporte: nivel por requisito según el mejor fragmento, contexto con los mejores
 * por consulta y los fragmentos `00-` siempre incluidos.
 */
export function buildMatchReport(
  vacancyId: string,
  queries: Query[],
  rankedPerQuery: Scored[][],
  always: Chunk[],
): MatchReport {
  const best = new Map<string, { c: Chunk; score: number }>();
  const requirements: RequirementMatch[] = [];

  queries.forEach((q, qi) => {
    const scored = rankedPerQuery[qi];
    for (const { c, score } of scored.slice(0, TOP_PER_QUERY)) {
      const prev = best.get(c.id);
      if (!prev || score > prev.score) best.set(c.id, { c, score });
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

  const selected: RetrievedChunk[] = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map(({ c, score }) => toRetrieved(c, score));

  for (const c of always) {
    if (!selected.some((s) => s.id === c.id)) selected.unshift(toRetrieved(c, 1));
  }

  const coverage = weightedCoverage(
    requirements.filter((r) => r.kind === "must").map((r) => r.level),
  );

  return { vacancyId, coverage, requirements, chunks: selected };
}

function toRetrieved(c: Chunk, score: number): RetrievedChunk {
  return { id: c.id, file: c.file, heading: c.heading, text: c.text, score: round(score) };
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
