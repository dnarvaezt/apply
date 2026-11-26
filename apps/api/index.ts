import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { ProfileFile } from "@apply/shared";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createApplicationsRepository } from "./applications/repository.ts";
import { applicationRoutes } from "./applications/routes.ts";
import { createCvsRepository } from "./cvs/repository.ts";
import { cvRoutes } from "./cvs/routes.ts";
import { closeDb, getDb } from "./db.ts";
import { fetchVacancyText } from "./fetch-url.ts";
import { cleanMarkdown, extractVacancy, MODEL, streamCv } from "./llm.ts";
import { ENV_FILE } from "./paths.ts";
import { closeBrowser, markdownToPdf } from "./pdf.ts";
import { buildIndex, getIndexStatus, retrieveForVacancy } from "./rag/index.ts";
import { ensureDataDirs, listFiles, mtime, PROFILE_DIR, removeFile, safeName } from "./storage.ts";
import { createVacanciesRepository } from "./vacancies/repository.ts";
import { vacancyRoutes } from "./vacancies/routes.ts";

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // sin .env: se usan variables de entorno o el perfil de `ant auth login`
}

await ensureDataDirs();

const app = new Hono().basePath("/api");

app.onError((err, c) => {
  console.error(err);
  let message = err instanceof Error ? err.message : String(err);
  if (err instanceof Anthropic.AuthenticationError) {
    message = "Credenciales de Anthropic inválidas o ausentes. Define ANTHROPIC_API_KEY en .env";
  } else if (err instanceof Anthropic.RateLimitError) {
    message = "Límite de uso de la API alcanzado; intenta de nuevo en un momento.";
  } else if (err instanceof Anthropic.APIError) {
    message = `Error de la API de Claude (${err.status}): ${err.message}`;
  }
  return c.json({ error: message }, 500);
});

app.get("/health", (c) => c.json({ ok: true, model: MODEL }));

// ───────────── Perfil (base de conocimiento del RAG) ─────────────

app.get("/profile", async (c) => {
  const files = await listFiles(PROFILE_DIR, ".md");
  const out: ProfileFile[] = [];
  for (const name of files) {
    const file = path.join(PROFILE_DIR, name);
    out.push({
      name,
      content: await readFile(file, "utf8"),
      updatedAt: new Date(await mtime(file)).toISOString(),
    });
  }
  return c.json(out);
});

app.put("/profile/:name", async (c) => {
  const name = safeName(c.req.param("name"), ".md");
  const { content } = await c.req.json<{ content: string }>();
  await writeFile(path.join(PROFILE_DIR, name), content, "utf8");
  return c.json({ name });
});

app.delete("/profile/:name", async (c) => {
  await removeFile(path.join(PROFILE_DIR, safeName(c.req.param("name"), ".md")));
  return c.json({ ok: true });
});

app.get("/index/status", async (c) => c.json(await getIndexStatus()));
app.post("/index/rebuild", async (c) => c.json(await buildIndex()));

// ───────────── Vacantes, CVs y postulaciones (Postgres) ─────────────

const vacanciesRepo = createVacanciesRepository(getDb());
const cvsRepo = createCvsRepository(getDb());

app.route(
  "/",
  vacancyRoutes({
    repo: vacanciesRepo,
    fetchText: fetchVacancyText,
    extract: extractVacancy,
    retrieve: retrieveForVacancy,
  }),
);
app.route(
  "/",
  cvRoutes({
    repo: cvsRepo,
    getVacancy: (id) => vacanciesRepo.get(id),
    retrieve: retrieveForVacancy,
    streamCv,
    cleanMarkdown,
    renderPdf: markdownToPdf,
  }),
);
app.route("/", applicationRoutes({ repo: createApplicationsRepository(getDb()) }));

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API local en http://localhost:${port}/api  ·  modelo: ${MODEL}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeBrowser();
    await closeDb();
    process.exit(0);
  });
}
