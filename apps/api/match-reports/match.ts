import type { CvRequirementMatch, KeywordCoverage, Vacancy } from "@apply/shared";
import type { Chunk } from "../rag/chunk.ts";
import { cosine, level, rankChunks, round, toContent, weightedCoverage } from "../rag/match.ts";

/**
 * Versión del cálculo que se guarda en `match_reports.model`: el número no sale de un LLM (D6),
 * así que el "modelo" es este algoritmo. Cambiarlo invalida los informes guardados.
 */
export const MATCH_MODEL = "cv-match-v1";
export const EVIDENCE_CHARS = 280;

/** Caracteres que forman parte de un término técnico: `c` no coincide dentro de `c++` ni `c#`. */
const TERM_CHAR = "[\\p{L}\\p{N}_+#]";

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Coincidencia exacta de cada keyword con límites de palabra, sin distinguir mayúsculas ni
 * tildes (estilo `calculate_keyword_match` de Resume-Matcher): `Java` no cuenta en `JavaScript`.
 */
export function keywordCoverage(keywords: string[], text: string): KeywordCoverage {
  const haystack = normalize(text);
  const seen = new Set<string>();
  const found: string[] = [];
  const missing: string[] = [];
  for (const keyword of keywords) {
    const term = normalize(keyword.trim());
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const re = new RegExp(`(?<!${TERM_CHAR})${escapeRegExp(term)}(?!${TERM_CHAR})`, "u");
    (re.test(haystack) ? found : missing).push(keyword.trim());
  }
  const total = found.length + missing.length;
  return { found, missing, coverage: total === 0 ? 1 : round(found.length / total) };
}

/** Recorte del fragmento del CV que se muestra como evidencia. */
export function evidenceText(text: string): string {
  const clean = text.trim();
  return clean.length <= EVIDENCE_CHARS ? clean : `${clean.slice(0, EVIDENCE_CHARS)}…`;
}

export type CvMatchInput = Pick<Vacancy, "mustHave" | "niceToHave" | "keywords">;

/** Requisitos que se miden contra el CV, en el orden del informe: `mustHave` y luego `niceToHave`. */
export function cvRequirements(vacancy: CvMatchInput): { text: string; kind: "must" | "nice" }[] {
  return [
    ...vacancy.mustHave.map((text) => ({ text, kind: "must" as const })),
    ...vacancy.niceToHave.map((text) => ({ text, kind: "nice" as const })),
  ];
}

/**
 * Informe determinista del CV frente a la vacante (D6): por requisito, el mejor fragmento del CV
 * (coseno + bonus léxico, los mismos umbrales que el match del perfil); cobertura ponderada solo
 * con `mustHave`; keywords exactas sobre todo el CV. `passages[i]` es el vector de `chunks[i]` y
 * `queries[j]` el del requisito `j` de `cvRequirements`.
 */
export function buildCvMatch(
  vacancy: CvMatchInput,
  chunks: Chunk[],
  passages: number[][],
  queries: number[][],
): { coverage: number; requirements: CvRequirementMatch[]; keywords: KeywordCoverage } {
  const wanted = cvRequirements(vacancy);
  if (passages.length !== chunks.length || queries.length !== wanted.length) {
    throw new Error("La cantidad de vectores no coincide con los fragmentos o los requisitos");
  }

  const requirements = wanted.map(({ text, kind }, qi): CvRequirementMatch => {
    const candidates = chunks.map((chunk, ci) => ({
      chunk,
      sem: cosine(queries[qi], passages[ci]),
    }));
    const top = rankChunks(text, candidates)[0];
    const lvl = top ? level(top.score) : "débil";
    return {
      requirement: text,
      kind,
      score: top ? round(top.score) : 0,
      level: lvl,
      evidence:
        top && lvl !== "débil" ? { heading: top.c.heading, text: evidenceText(top.c.text) } : null,
    };
  });

  return {
    coverage: weightedCoverage(requirements.filter((r) => r.kind === "must").map((r) => r.level)),
    requirements,
    keywords: keywordCoverage(vacancy.keywords, chunks.map(toContent).join("\n")),
  };
}
