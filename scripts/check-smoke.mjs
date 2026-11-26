// Verifica el reporte del canario de mutación: falla si no hay mutantes muertos
// o si el puntaje queda bajo el umbral (C6, OBS-17).
import { readFileSync } from "node:fs";

const THRESHOLD = 70;
const report = JSON.parse(readFileSync("reports/mutation-smoke/mutation.json", "utf8"));
const counts = {};
for (const file of Object.values(report.files)) {
  for (const mutant of file.mutants) counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
}
const killed = counts.Killed ?? 0;
const detected = killed + (counts.Timeout ?? 0);
const valid = detected + (counts.Survived ?? 0) + (counts.NoCoverage ?? 0);
const score = valid === 0 ? 0 : (detected / valid) * 100;
console.log(`mut:smoke killed=${killed} score=${score.toFixed(2)}% (umbral ${THRESHOLD}%)`);
if (killed === 0 || score < THRESHOLD) {
  console.error("mut:smoke FALLÓ: sin mutantes muertos o puntaje bajo el umbral");
  process.exit(1);
}
