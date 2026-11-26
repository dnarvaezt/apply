import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { CvDoc, CvMeta, GenerateCvRequest, ProfileFile, Vacancy } from "../shared/types.ts";
import { fetchVacancyText } from "./fetch-url.ts";
import { cleanMarkdown, extractVacancy, MODEL, streamCv } from "./llm.ts";
import { closeBrowser, markdownToPdf } from "./pdf.ts";
import { buildIndex, getIndexStatus, retrieveForVacancy } from "./rag/index.ts";
import {
  CVS_DIR,
  ensureDataDirs,
  listFiles,
  mtime,
  newId,
  PROFILE_DIR,
  readJson,
  removeFile,
  safeName,
  slugify,
  VACANCIES_DIR,
  writeJson,
} from "./storage.ts";

try {
  process.loadEnvFile(".env");
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

// ───────────── Vacantes ─────────────

async function loadVacancy(id: string): Promise<Vacancy | null> {
  return readJson<Vacancy>(path.join(VACANCIES_DIR, safeName(id, ".json")));
}

app.get("/vacancies", async (c) => {
  const files = await listFiles(VACANCIES_DIR, ".json");
  const items = await Promise.all(files.map((f) => readJson<Vacancy>(path.join(VACANCIES_DIR, f))));
  return c.json(
    items
      .filter((v): v is Vacancy => v !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
});

app.post("/vacancies", async (c) => {
  const body = await c.req.json<{ text?: string; url?: string }>();
  const url = body.url?.trim() || null;
  let rawText = body.text?.trim() ?? "";
  if (!rawText && url) rawText = await fetchVacancyText(url);
  if (rawText.length < 80)
    return c.json({ error: "Pega el texto de la vacante o una URL válida" }, 400);

  const extracted = await extractVacancy(rawText);
  const vacancy: Vacancy = {
    id: newId(slugify(`${extracted.company}-${extracted.title}`) || "vacante"),
    createdAt: new Date().toISOString(),
    sourceUrl: url,
    rawText,
    ...extracted,
  };
  await writeJson(path.join(VACANCIES_DIR, `${vacancy.id}.json`), vacancy);
  return c.json(vacancy);
});

app.get("/vacancies/:id", async (c) => {
  const v = await loadVacancy(c.req.param("id"));
  return v ? c.json(v) : c.json({ error: "Vacante no encontrada" }, 404);
});

app.delete("/vacancies/:id", async (c) => {
  await removeFile(path.join(VACANCIES_DIR, safeName(c.req.param("id"), ".json")));
  return c.json({ ok: true });
});

app.get("/vacancies/:id/match", async (c) => {
  const v = await loadVacancy(c.req.param("id"));
  if (!v) return c.json({ error: "Vacante no encontrada" }, 404);
  return c.json(await retrieveForVacancy(v));
});

// ───────────── CVs ─────────────

const cvPaths = (id: string) => {
  const base = safeName(id, ".md").replace(/\.md$/, "");
  return {
    md: path.join(CVS_DIR, `${base}.md`),
    meta: path.join(CVS_DIR, `${base}.json`),
    pdf: path.join(CVS_DIR, `${base}.pdf`),
  };
};

async function loadCv(id: string): Promise<CvDoc | null> {
  const p = cvPaths(id);
  const meta = await readJson<CvMeta>(p.meta);
  if (!meta) return null;
  return { ...meta, markdown: await readFile(p.md, "utf8") };
}

async function saveCv(doc: CvDoc): Promise<void> {
  const { markdown, ...meta } = doc;
  const p = cvPaths(doc.id);
  await writeFile(p.md, markdown, "utf8");
  await writeJson(p.meta, meta);
}

app.get("/cvs", async (c) => {
  const files = await listFiles(CVS_DIR, ".json");
  const items = await Promise.all(files.map((f) => readJson<CvMeta>(path.join(CVS_DIR, f))));
  return c.json(
    items
      .filter((m): m is CvMeta => m !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
});

app.get("/cvs/:id", async (c) => {
  const cv = await loadCv(c.req.param("id"));
  return cv ? c.json(cv) : c.json({ error: "CV no encontrado" }, 404);
});

app.put("/cvs/:id", async (c) => {
  const cv = await loadCv(c.req.param("id"));
  if (!cv) return c.json({ error: "CV no encontrado" }, 404);
  const body = await c.req.json<{ markdown: string; title?: string }>();
  const updated: CvDoc = {
    ...cv,
    markdown: body.markdown,
    title: body.title?.trim() || cv.title,
    updatedAt: new Date().toISOString(),
  };
  await saveCv(updated);
  return c.json(updated);
});

app.delete("/cvs/:id", async (c) => {
  const p = cvPaths(c.req.param("id"));
  await Promise.all([removeFile(p.md), removeFile(p.meta), removeFile(p.pdf)]);
  return c.json({ ok: true });
});

app.post("/cvs/generate", async (c) => {
  const { vacancyId, instructions } = await c.req.json<GenerateCvRequest>();
  const vacancy = await loadVacancy(vacancyId);
  if (!vacancy) return c.json({ error: "Vacante no encontrada" }, 404);

  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({ event: "status", data: "Recuperando evidencia del perfil…" });
      const report = await retrieveForVacancy(vacancy);
      await stream.writeSSE({ event: "match", data: JSON.stringify(report) });
      await stream.writeSSE({ event: "status", data: "Redactando CV con Claude…" });

      let markdown = "";
      for await (const delta of streamCv(vacancy, report.chunks, instructions)) {
        markdown += delta;
        await stream.writeSSE({ event: "delta", data: JSON.stringify(delta) });
      }

      const now = new Date().toISOString();
      const doc: CvDoc = {
        id: newId(slugify(vacancy.company) || "cv"),
        vacancyId: vacancy.id,
        title: `${vacancy.title} — ${vacancy.company}`,
        createdAt: now,
        updatedAt: now,
        markdown: cleanMarkdown(markdown),
      };
      await saveCv(doc);
      await stream.writeSSE({ event: "done", data: JSON.stringify(doc) });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: "error", data: message });
    }
  });
});

app.get("/cvs/:id/pdf", async (c) => {
  const cv = await loadCv(c.req.param("id"));
  if (!cv) return c.json({ error: "CV no encontrado" }, 404);
  const pdf = await markdownToPdf(cv.markdown, cv.title);
  await writeFile(cvPaths(cv.id).pdf, pdf);

  const name = cv.markdown.match(/^#\s+(.+)$/m)?.[1] ?? "CV";
  const filename = `CV-${slugify(name)}-${slugify(cv.title)}.pdf`;
  return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API local en http://localhost:${port}/api  ·  modelo: ${MODEL}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeBrowser();
    process.exit(0);
  });
}
