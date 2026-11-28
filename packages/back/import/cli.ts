import { closeDb, getDb } from "../db.ts";
import { ENV_FILE } from "../paths.ts";
import { EMBED_MODEL, embed } from "../rag/embed.ts";
import { DATA_DIR } from "../storage.ts";
import { importLegacyData } from "./import-data.ts";
import { exitCode, formatReport } from "./report.ts";

/** `npm run db:import`: lee `DATABASE_URL` y `CV_DATA_DIR` (por defecto `data/`). */
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // sin .env: se usan las variables de entorno
}

try {
  const report = await importLegacyData({
    db: getDb(),
    dataDir: DATA_DIR,
    model: EMBED_MODEL,
    embed,
  });
  console.log(formatReport(report));
  process.exitCode = exitCode(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
