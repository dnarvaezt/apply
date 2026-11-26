import type { MatchReport, Vacancy } from "@apply/shared";
import { Hono } from "hono";
import type { ExtractedVacancy } from "../llm.ts";
import type { VacanciesRepository } from "./repository.ts";

export interface VacancyRoutesDeps {
  repo: VacanciesRepository;
  /** Frontera externa: descarga el texto de una URL de vacante. */
  fetchText: (url: string) => Promise<string>;
  /** Frontera externa: extrae los campos de la vacante con Claude. */
  extract: (rawText: string) => Promise<ExtractedVacancy>;
  retrieve: (vacancy: Vacancy) => Promise<MatchReport>;
}

const NOT_FOUND = { error: "Vacante no encontrada" };

export function vacancyRoutes({ repo, fetchText, extract, retrieve }: VacancyRoutesDeps) {
  return new Hono()
    .get("/vacancies", async (c) => c.json(await repo.list()))

    .post("/vacancies", async (c) => {
      const body = await c.req.json<{ text?: string; url?: string }>();
      const url = body.url?.trim() || null;
      let rawText = body.text?.trim() ?? "";
      if (!rawText && url) rawText = await fetchText(url);
      if (rawText.length < 80)
        return c.json({ error: "Pega el texto de la vacante o una URL válida" }, 400);

      const extracted = await extract(rawText);
      return c.json(await repo.create({ sourceUrl: url, rawText, ...extracted }));
    })

    .get("/vacancies/:id", async (c) => {
      const vacancy = await repo.get(c.req.param("id"));
      return vacancy ? c.json(vacancy) : c.json(NOT_FOUND, 404);
    })

    .delete("/vacancies/:id", async (c) => {
      await repo.remove(c.req.param("id"));
      return c.json({ ok: true });
    })

    .get("/vacancies/:id/match", async (c) => {
      const vacancy = await repo.get(c.req.param("id"));
      if (!vacancy) return c.json(NOT_FOUND, 404);
      return c.json(await retrieve(vacancy));
    });
}
