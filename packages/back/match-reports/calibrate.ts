import type { MatchLevel } from "@apply/shared";
import { z } from "zod";
import { levelWith, type Thresholds } from "../rag/match.ts";

/** Puntaje del mejor fragmento de un requisito y el nivel que le dio una persona (C9). */
export interface LabeledScore {
  score: number;
  expected: MatchLevel;
}

export interface Hits {
  total: number;
  hits: number;
}

export type HitTable = Record<MatchLevel | "all", Hits>;

export interface Calibration {
  thresholds: Thresholds;
  before: HitTable;
  after: HitTable;
}

/** Aciertos por nivel esperado con unos umbrales: la tabla de evidencia de #25 (AC-001). */
export function hitTable(samples: LabeledScore[], thresholds: Thresholds): HitTable {
  const table: HitTable = {
    fuerte: { total: 0, hits: 0 },
    parcial: { total: 0, hits: 0 },
    débil: { total: 0, hits: 0 },
    all: { total: 0, hits: 0 },
  };
  for (const { score, expected } of samples) {
    const hit = levelWith(score, thresholds) === expected ? 1 : 0;
    for (const row of [table[expected], table.all]) {
      row.total += 1;
      row.hits += hit;
    }
  }
  return table;
}

const distance = (a: Thresholds, b: Thresholds) =>
  Math.abs(a.strong - b.strong) + Math.abs(a.partial - b.partial);

/**
 * Umbrales que más aciertan sobre la muestra; a igualdad, los más cercanos a los vigentes para
 * no mover más de lo que la evidencia pide. Solo se prueban cortes en los puntajes observados
 * (más los vigentes y uno sobre el máximo), porque entre dos puntajes el resultado no cambia.
 */
export function calibrate(samples: LabeledScore[], current: Thresholds): Calibration {
  if (samples.length === 0) throw new Error("La muestra está vacía: no hay con qué calibrar");
  const scores = samples.map((s) => s.score);
  const aboveAll = Math.round((Math.max(...scores) + 0.001) * 1000) / 1000;
  const cuts = [...new Set([...scores, current.strong, current.partial, aboveAll])];

  let best = { thresholds: current, hits: hitTable(samples, current).all.hits };
  for (const strong of cuts) {
    for (const partial of cuts) {
      if (partial > strong) continue;
      const candidate = { strong, partial };
      const hits = hitTable(samples, candidate).all.hits;
      const better =
        hits > best.hits ||
        (hits === best.hits && distance(candidate, current) < distance(best.thresholds, current));
      if (better) best = { thresholds: candidate, hits };
    }
  }
  return {
    thresholds: best.thresholds,
    before: hitTable(samples, current),
    after: hitTable(samples, best.thresholds),
  };
}

const LEVELS = ["fuerte", "parcial", "débil"] as const satisfies readonly MatchLevel[];

const expectedSchema = z.object({ requirement: z.string().min(1), level: z.enum(LEVELS) });

/** Un par CV-vacante de la muestra de #25 con el nivel que una persona le da a cada requisito. */
const sampleSchema = z
  .object({
    cv: z.string().min(1),
    vacancy: z.object({
      mustHave: z.array(z.string()),
      niceToHave: z.array(z.string()),
      keywords: z.array(z.string()),
    }),
    expected: z.array(expectedSchema).min(1),
  })
  .superRefine(({ vacancy, expected }, ctx) => {
    const known = new Set([...vacancy.mustHave, ...vacancy.niceToHave]);
    for (const { requirement } of expected) {
      if (!known.has(requirement)) {
        ctx.addIssue(`"${requirement}" no es un requisito de la vacante`);
      }
    }
  });

export type CalibrationSample = z.infer<typeof sampleSchema>;
export type ExpectedLevel = z.infer<typeof expectedSchema>;

export function parseSample(input: unknown): CalibrationSample {
  const parsed = sampleSchema.safeParse(input);
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  return parsed.data;
}

/** Puntaje que el match dio a cada requisito etiquetado, junto al nivel esperado. */
export function labeledScores(
  requirements: { requirement: string; score: number }[],
  expected: ExpectedLevel[],
): LabeledScore[] {
  const scores = new Map(requirements.map((r) => [r.requirement, r.score]));
  return expected.map(({ requirement, level }) => {
    const score = scores.get(requirement);
    if (score === undefined) throw new Error(`El match no puntuó "${requirement}"`);
    return { score, expected: level };
  });
}

const cell = ({ hits, total }: Hits, percent: boolean) =>
  percent ? `${hits}/${total} (${Math.round((hits / total) * 100)} %)` : `${hits}/${total}`;

const describeThresholds = ({ strong, partial }: Thresholds) =>
  `fuerte ≥ ${strong}, parcial ≥ ${partial}`;

/** Tabla Markdown de aciertos antes y después: la evidencia que pide AC-001 de #25. */
export function formatCalibration({ thresholds, before, after }: Calibration, current: Thresholds) {
  const rows = LEVELS.map(
    (lvl) => `| ${lvl} | ${cell(before[lvl], false)} | ${cell(after[lvl], false)} |`,
  );
  return [
    "| Nivel esperado | Actual | Propuesto |",
    "| --- | --- | --- |",
    `| Umbrales | ${describeThresholds(current)} | ${describeThresholds(thresholds)} |`,
    ...rows,
    `| Total | ${cell(before.all, true)} | ${cell(after.all, true)} |`,
  ].join("\n");
}
