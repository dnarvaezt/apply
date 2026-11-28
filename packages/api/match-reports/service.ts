import { createHash } from "node:crypto";
import type { CvDoc, CvMatchReport, Vacancy } from "@apply/shared";
import { chunkMarkdown } from "../rag/chunk.ts";
import { MATCH_WEIGHTS, toContent } from "../rag/match.ts";
import { buildCvMatch, cvRequirements, MATCH_MODEL } from "./match.ts";
import type { MatchReportsRepository } from "./repository.ts";

export interface CvMatcherDeps {
  repo: MatchReportsRepository;
  embedModel: string;
  embed: (texts: string[], kind: "query" | "passage") => Promise<number[][]>;
}

/**
 * Mide el CV generado (no el perfil) frente a su vacante y guarda el informe. Si ya hay uno del
 * mismo Markdown, algoritmo y modelo de embeddings lo devuelve: editar el CV produce uno nuevo.
 */
export function createCvMatcher({ repo, embedModel, embed }: CvMatcherDeps) {
  return async function reportFor(cv: CvDoc, vacancy: Vacancy): Promise<CvMatchReport> {
    const key = {
      cvHash: createHash("sha256").update(cv.markdown).digest("hex"),
      model: MATCH_MODEL,
      embedModel,
    };
    const saved = await repo.latest(cv.id, key);
    if (saved) return saved;

    const chunks = chunkMarkdown("cv", cv.markdown);
    const passages = chunks.length > 0 ? await embed(chunks.map(toContent), "passage") : [];
    const requirements = cvRequirements(vacancy).map((r) => r.text);
    const queries = requirements.length > 0 ? await embed(requirements, "query") : [];

    return repo.save({
      ...key,
      ...buildCvMatch(vacancy, chunks, passages, queries),
      cvId: cv.id,
      vacancyId: vacancy.id,
      weights: MATCH_WEIGHTS,
    });
  };
}

export type CvMatcher = ReturnType<typeof createCvMatcher>;
