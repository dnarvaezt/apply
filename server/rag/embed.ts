import path from "node:path";
import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";

/**
 * Embeddings 100% locales con transformers.js (ONNX). El modelo se descarga una sola vez
 * (~120 MB) a .cache/models. multilingual-e5 funciona bien con español e inglés.
 */
export const EMBED_MODEL = process.env.EMBED_MODEL ?? "Xenova/multilingual-e5-small";
env.cacheDir = path.resolve(".cache/models");

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
  return extractor;
}

const BATCH = 16;

/** e5 espera prefijos "query:" / "passage:" para asimetría pregunta-documento. */
export async function embed(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
  const ex = await getExtractor();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH).map((t) => `${kind}: ${t}`);
    const output = await ex(batch, { pooling: "mean", normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }
  return vectors;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
