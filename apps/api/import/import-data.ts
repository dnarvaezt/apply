import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCvsRepository } from "../cvs/repository.ts";
import type { Db } from "../db.ts";
import { createRagIndex, type RagDeps } from "../rag/index.ts";
import { listFiles } from "../storage.ts";
import { createVacanciesRepository } from "../vacancies/repository.ts";
import { legacyVacancyToNew, parseLegacyCvMeta, parseLegacyVacancy } from "./legacy.ts";
import type { ImportReport, Tally } from "./report.ts";

export interface ImportDeps {
  db: Db;
  /** Raíz de `data/`: solo se lee, nunca se escribe ni se borra (REQ-003). */
  dataDir: string;
  model: string;
  embed: RagDeps["embed"];
}

/**
 * Importa a Postgres las vacantes y CVs que la versión en archivos dejó en `data/` y reconstruye
 * el índice del perfil (#14). Idempotente por id viejo; un archivo inválido queda en `errors`
 * y no detiene el resto.
 */
export async function importLegacyData(deps: ImportDeps): Promise<ImportReport> {
  const vacanciesRepo = createVacanciesRepository(deps.db);
  const cvsRepo = createCvsRepository(deps.db);
  const errors: ImportReport["errors"] = [];

  /** Corre `load` por cada `.json` de `dir`; las vacantes van antes que los CVs que las citan. */
  async function each(dir: string, load: (file: string) => Promise<"imported" | "skipped">) {
    const tally: Tally = { imported: 0, skipped: 0 };
    for (const name of await listFiles(path.join(deps.dataDir, dir), ".json")) {
      const file = path.join(dir, name);
      try {
        tally[await load(path.join(deps.dataDir, file))]++;
      } catch (error) {
        errors.push({ file, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return tally;
  }

  const vacancies = await each("vacancies", async (file) => {
    const { legacyId, input, createdAt } = legacyVacancyToNew(
      parseLegacyVacancy(await readFile(file, "utf8")),
    );
    return vacanciesRepo.importLegacy(legacyId, input, createdAt);
  });

  const cvs = await each("cvs", async (file) => {
    const meta = parseLegacyCvMeta(await readFile(file, "utf8"));
    const markdown = await readFile(file.replace(/\.json$/, ".md"), "utf8");
    return cvsRepo.importLegacy({
      legacyId: meta.id,
      vacancyLegacyId: meta.vacancyId,
      title: meta.title,
      markdown,
      createdAt: new Date(meta.createdAt),
      updatedAt: new Date(meta.updatedAt),
    });
  });

  const profile = await createRagIndex({
    db: deps.db,
    profileDir: path.join(deps.dataDir, "profile"),
    model: deps.model,
    embed: deps.embed,
  }).buildIndex();

  return { vacancies, cvs, profile: { chunks: profile.chunks }, errors };
}
