import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProfileFile } from "@apply/shared";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createApplicationsRepository } from "./applications/repository.ts";
import { applicationRoutes } from "./applications/routes.ts";
import { claudeBinaryExists } from "./claude/binary.ts";
import { readClaudeConfig } from "./claude/cli.ts";
import { createContactsRepository } from "./contacts/repository.ts";
import { contactRoutes } from "./contacts/routes.ts";
import { createCvsRepository } from "./cvs/repository.ts";
import { cvRoutes } from "./cvs/routes.ts";
import { closeDb, getDb } from "./db.ts";
import { createEmailDraftsRepository } from "./emails/repository.ts";
import { emailDraftRoutes } from "./emails/routes.ts";
import { createEmailSender } from "./emails/send.ts";
import { emailSendRoutes } from "./emails/send-routes.ts";
import { apiErrorHandler } from "./errors.ts";
import { fetchVacancyText } from "./fetch-url.ts";
import { readGmailConfig, readSyncMinutes } from "./gmail/config.ts";
import { createGmailConnection } from "./gmail/connection.ts";
import { gmailRoutes } from "./gmail/routes.ts";
import { createReplySync } from "./gmail/sync.ts";
import { createSyncRepository } from "./gmail/sync-repository.ts";
import { gmailSyncRoutes } from "./gmail/sync-routes.ts";
import { createTokenStore } from "./gmail/token-store.ts";
import { healthRoutes } from "./health/routes.ts";
import {
  cleanMarkdown,
  draftApplicationEmail,
  extractVacancy,
  extractVacancyFromImage,
  streamCv,
} from "./llm.ts";
import { createMatchReportsRepository } from "./match-reports/repository.ts";
import { createCvMatcher } from "./match-reports/service.ts";
import { createMetricsRepository } from "./metrics/repository.ts";
import { metricRoutes } from "./metrics/routes.ts";
import { ENV_FILE } from "./paths.ts";
import { closeBrowser, markdownToPdf } from "./pdf.ts";
import { EMBED_MODEL, embed } from "./rag/embed.ts";
import { buildIndex, getIndexStatus, retrieveForVacancy } from "./rag/index.ts";
import { ensureDataDirs, listFiles, mtime, PROFILE_DIR, removeFile, safeName } from "./storage.ts";
import { createVacanciesRepository } from "./vacancies/repository.ts";
import { vacancyRoutes } from "./vacancies/routes.ts";

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // sin .env: se usan las variables de entorno del proceso
}

await ensureDataDirs();

const app = new Hono().basePath("/api");

app.onError(apiErrorHandler);

app.route(
  "/",
  healthRoutes({
    config: () => readClaudeConfig(process.env),
    binaryExists: (bin) => claudeBinaryExists(bin, process.env.PATH ?? ""),
  }),
);

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
    extractFromImage: extractVacancyFromImage,
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
    matchReport: createCvMatcher({
      repo: createMatchReportsRepository(getDb()),
      embedModel: EMBED_MODEL,
      embed,
    }),
  }),
);
app.route("/", applicationRoutes({ repo: createApplicationsRepository(getDb()) }));
app.route("/", contactRoutes({ repo: createContactsRepository(getDb()) }));
app.route("/", metricRoutes({ repo: createMetricsRepository(getDb()) }));
app.route(
  "/",
  emailDraftRoutes({
    repo: createEmailDraftsRepository(getDb()),
    getCv: (id) => cvsRepo.get(id),
    getVacancy: (id) => vacanciesRepo.get(id),
    draft: (input) => draftApplicationEmail(input),
  }),
);

// ───────────── Gmail (opcional: sin credenciales la app sigue funcionando) ─────────────

const gmailConfig = readGmailConfig();
const gmail =
  gmailConfig &&
  createGmailConnection({ config: gmailConfig, store: createTokenStore(gmailConfig.tokenDir) });
app.route("/", gmailRoutes({ gmail }));
app.route(
  "/",
  emailSendRoutes({
    sender: createEmailSender({
      repo: createEmailDraftsRepository(getDb()),
      gmail,
      getCv: (id) => cvsRepo.get(id),
      renderPdf: markdownToPdf,
    }),
  }),
);

// Detección de respuestas (#22): al iniciar y cada N minutos; sin cuenta usable no llama a Gmail.
const syncMinutes = readSyncMinutes();
const replySync = createReplySync({
  gmail,
  repo: createSyncRepository(getDb()),
  applications: createApplicationsRepository(getDb()),
  intervalMinutes: syncMinutes,
});
app.route("/", gmailSyncRoutes({ sync: replySync }));
const syncReplies = () =>
  replySync.run().catch((e: unknown) => {
    console.error("Gmail: la detección de respuestas falló:", e instanceof Error ? e.message : e);
  });
const syncTimer = setInterval(syncReplies, syncMinutes * 60_000);
syncTimer.unref();
void syncReplies();

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(
    `API local en http://localhost:${port}/api  ·  modelo: ${readClaudeConfig(process.env).model}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(syncTimer);
    gmail?.close();
    await closeBrowser();
    await closeDb();
    process.exit(0);
  });
}
