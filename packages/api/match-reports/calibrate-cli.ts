import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkMarkdown } from "../rag/chunk.ts";
import { embed } from "../rag/embed.ts";
import { PARTIAL, STRONG, toContent } from "../rag/match.ts";
import { DATA_DIR } from "../storage.ts";
import {
  calibrate,
  formatCalibration,
  type LabeledScore,
  labeledScores,
  parseSample,
} from "./calibrate.ts";
import { buildCvMatch, cvRequirements } from "./match.ts";

/**
 * `npm run match:calibrate [carpeta]`: puntúa cada par CV-vacante etiquetado de la muestra (por
 * defecto `data/match-sample/`, fuera de git porque son CVs reales) con el match vigente y propone
 * los umbrales que más aciertan (#25). No cambia nada: los umbrales se editan en `rag/match.ts`.
 */
const dir = path.resolve(process.argv[2] ?? path.join(DATA_DIR, "match-sample"));

async function scoreFile(file: string): Promise<LabeledScore[]> {
  const sample = parseSample(JSON.parse(await readFile(file, "utf8")));
  const chunks = chunkMarkdown("cv", sample.cv);
  if (chunks.length === 0) throw new Error("el CV no tiene contenido que puntuar");
  const passages = await embed(chunks.map(toContent), "passage");
  const queries = await embed(
    cvRequirements(sample.vacancy).map((r) => r.text),
    "query",
  );
  const { requirements } = buildCvMatch(sample.vacancy, chunks, passages, queries);
  return labeledScores(requirements, sample.expected);
}

try {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const samples: LabeledScore[] = [];
  for (const file of files) {
    try {
      samples.push(...(await scoreFile(path.join(dir, file))));
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const current = { strong: STRONG, partial: PARTIAL };
  console.log(`${files.length} pares, ${samples.length} requisitos etiquetados (${dir})\n`);
  console.log(formatCalibration(calibrate(samples, current), current));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
