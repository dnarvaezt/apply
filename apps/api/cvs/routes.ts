import type {
  CvDoc,
  CvMatchReport,
  GenerateCvRequest,
  MatchReport,
  RetrievedChunk,
  Vacancy,
} from "@apply/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cvPdfFilename } from "../storage.ts";
import type { CvsRepository } from "./repository.ts";

export interface CvRoutesDeps {
  repo: CvsRepository;
  getVacancy: (id: string) => Promise<Vacancy | null>;
  retrieve: (vacancy: Vacancy) => Promise<MatchReport>;
  /** Frontera externa: redacta el CV con Claude, por fragmentos de Markdown. */
  streamCv: (
    vacancy: Vacancy,
    chunks: RetrievedChunk[],
    instructions?: string,
  ) => AsyncIterable<string>;
  cleanMarkdown: (markdown: string) => string;
  /** Genera el PDF en memoria; la API no lo guarda (C1). */
  renderPdf: (markdown: string, title: string) => Promise<Uint8Array>;
  /** Informe de match del CV generado frente a su vacante (D6). */
  matchReport: (cv: CvDoc, vacancy: Vacancy) => Promise<CvMatchReport>;
}

const NOT_FOUND = { error: "CV no encontrado" };

export function cvRoutes({
  repo,
  getVacancy,
  retrieve,
  streamCv,
  cleanMarkdown,
  renderPdf,
  matchReport,
}: CvRoutesDeps) {
  return new Hono()
    .get("/cvs", async (c) => c.json(await repo.list()))

    .get("/cvs/:id", async (c) => {
      const cv = await repo.get(c.req.param("id"));
      return cv ? c.json(cv) : c.json(NOT_FOUND, 404);
    })

    .get("/cvs/:id/match", async (c) => {
      const cv = await repo.get(c.req.param("id"));
      if (!cv) return c.json(NOT_FOUND, 404);
      const vacancy = cv.vacancyId === null ? null : await getVacancy(cv.vacancyId);
      if (!vacancy) return c.json({ error: "El CV no tiene vacante con la cual medirlo" }, 404);
      return c.json(await matchReport(cv, vacancy));
    })

    .put("/cvs/:id", async (c) => {
      const body = await c.req.json<{ markdown: string; title?: string }>();
      const updated = await repo.update(c.req.param("id"), body);
      return updated ? c.json(updated) : c.json(NOT_FOUND, 404);
    })

    .delete("/cvs/:id", async (c) => {
      await repo.remove(c.req.param("id"));
      return c.json({ ok: true });
    })

    .post("/cvs/generate", async (c) => {
      const { vacancyId, instructions } = await c.req.json<GenerateCvRequest>();
      const vacancy = await getVacancy(vacancyId);
      if (!vacancy) return c.json({ error: "Vacante no encontrada" }, 404);

      return streamSSE(c, async (stream) => {
        try {
          await stream.writeSSE({ event: "status", data: "Recuperando evidencia del perfil…" });
          const report = await retrieve(vacancy);
          await stream.writeSSE({ event: "match", data: JSON.stringify(report) });
          await stream.writeSSE({ event: "status", data: "Redactando CV con Claude…" });

          let markdown = "";
          for await (const delta of streamCv(vacancy, report.chunks, instructions)) {
            markdown += delta;
            await stream.writeSSE({ event: "delta", data: JSON.stringify(delta) });
          }

          const doc = await repo.create({
            vacancyId: vacancy.id,
            title: `${vacancy.title} — ${vacancy.company}`,
            markdown: cleanMarkdown(markdown),
            language: vacancy.language,
          });
          await stream.writeSSE({ event: "done", data: JSON.stringify(doc) });
        } catch (err) {
          console.error(err);
          const message = err instanceof Error ? err.message : String(err);
          await stream.writeSSE({ event: "error", data: message });
        }
      });
    })

    .get("/cvs/:id/pdf", async (c) => {
      const cv = await repo.get(c.req.param("id"));
      if (!cv) return c.json(NOT_FOUND, 404);
      const pdf = await renderPdf(cv.markdown, cv.title);
      const filename = cvPdfFilename(cv.markdown, cv.title);
      // `inline` lo muestra en la vista previa antes de enviarlo (#21); si no, se descarga.
      const disposition = c.req.query("inline") === "1" ? "inline" : "attachment";
      return c.body(pdf as Uint8Array<ArrayBuffer>, 200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      });
    });
}
