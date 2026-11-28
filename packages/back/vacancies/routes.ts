import type { MatchReport, Vacancy } from "@apply/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ClaudeImage } from "../claude/cli.ts";
import type { FetchedVacancy } from "../fetch-url.ts";
import type { ExtractedImageVacancy, ExtractedVacancy, ExtractedWebVacancy } from "../llm.ts";
import { isHttpUrl } from "./http-url.ts";
import { MAX_BODY_BYTES, parseVacancyImage } from "./image.ts";
import type { ImageStore } from "./image-store.ts";
import { canonicalVacancyUrl } from "./linkedin-url.ts";
import { parseManualFields } from "./manual-fields.ts";
import { detectPlatform } from "./platform.ts";
import { resolvePostedAt } from "./posted-at.ts";
import type { VacanciesRepository } from "./repository.ts";

export interface VacancyRoutesDeps {
  repo: VacanciesRepository;
  /** Imágenes originales de las vacantes creadas desde imagen. */
  imageStore: ImageStore;
  /** Frontera externa: descarga la página de una URL de vacante (texto y JSON-LD). */
  fetchText: (url: string) => Promise<FetchedVacancy>;
  /** Frontera externa: extrae los campos de la vacante con Claude. */
  extract: (rawText: string) => Promise<ExtractedVacancy>;
  /** Frontera externa: transcribe la imagen y extrae los campos en una sola llamada a Claude. */
  extractFromImage: (image: ClaudeImage) => Promise<ExtractedImageVacancy>;
  /** Frontera externa: Claude abre la URL con el MCP de Chrome y extrae la vacante de la página. */
  extractFromWeb: (url: string) => Promise<ExtractedWebVacancy>;
  retrieve: (vacancy: Vacancy) => Promise<MatchReport>;
}

const NOT_FOUND = { error: "Vacante no encontrada" };

async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function vacancyRoutes({
  repo,
  imageStore,
  fetchText,
  extract,
  extractFromImage,
  extractFromWeb,
  retrieve,
}: VacancyRoutesDeps) {
  return (
    new Hono()
      .get("/vacancies", async (c) => c.json(await repo.list()))

      .post(
        "/vacancies",
        // Solo esta ruta recibe la imagen en base64: el tope no aplica a las demás.
        bodyLimit({
          maxSize: MAX_BODY_BYTES,
          onError: (c) => c.json({ error: "La solicitud es demasiado grande (máximo 8 MB)" }, 413),
        }),
        async (c) => {
          const body = await readBody(c);
          const manual = parseManualFields(body);
          if (!manual.ok) return c.json({ error: manual.error }, 400);
          const {
            text,
            url: rawUrl,
            image: rawImage,
            browser,
          } = body as { text?: unknown; url?: unknown; image?: unknown; browser?: unknown };

          const fromImage = rawImage !== undefined && rawImage !== null;
          const viaBrowser = !fromImage && browser === true;
          const pasted = fromImage ? null : (typeof rawUrl === "string" && rawUrl.trim()) || null;
          const url = pasted && canonicalVacancyUrl(pasted);
          let rawText = typeof text === "string" ? text.trim() : "";
          let page: FetchedVacancy | null = null;
          // Campos que ya vienen de la misma llamada que leyó la imagen o la página.
          let preExtracted: ExtractedVacancy | null = null;
          let imageToStore: ClaudeImage | null = null;
          if (fromImage) {
            const image = parseVacancyImage(rawImage);
            if (!image.ok) return c.json({ error: image.error }, image.status);
            const { transcription, ...fields } = await extractFromImage(image.value);
            preExtracted = fields;
            imageToStore = image.value;
            rawText = transcription.trim();
            if (rawText.length < 80)
              return c.json({ error: "No se pudo leer texto suficiente de la imagen" }, 422);
          } else if (viaBrowser) {
            if (!url || !isHttpUrl(url))
              return c.json({ error: "Pega la URL http o https de la vacante" }, 400);
            const { pageText, ...fields } = await extractFromWeb(url);
            preExtracted = fields;
            rawText = pageText.trim();
            if (rawText.length < 80)
              return c.json(
                { error: "Chrome no mostró la vacante en esa URL (¿pide iniciar sesión?)" },
                422,
              );
          } else if (!rawText && url) {
            page = await fetchText(url);
            rawText = page.text;
          }
          if (rawText.length < 80)
            return c.json({ error: "Pega el texto de la vacante o una URL válida" }, 400);

          const createdAt = new Date();
          const { postedAtText, ...extracted } = preExtracted ?? (await extract(rawText));
          const posted = resolvePostedAt(
            {
              manual: manual.value.postedAt ?? undefined,
              jsonLd: page?.postedAt,
              extracted: postedAtText,
            },
            createdAt,
          );
          const vacancy = await repo.create(
            {
              ...extracted,
              sourceUrl: url,
              fromImage,
              rawText,
              company: page?.company ?? extracted.company,
              platform: detectPlatform(url, rawText),
              // Al crear, un campo manual vacío no borra lo extraído: solo un valor lo reemplaza.
              posterName: manual.value.posterName ?? extracted.posterName,
              posterTitle: manual.value.posterTitle ?? extracted.posterTitle,
              posterProfileUrl: manual.value.posterProfileUrl ?? null,
              postedAt: posted.postedAt?.toISOString() ?? null,
              postedAtPrecision: posted.precision,
            },
            createdAt,
          );
          if (imageToStore) await imageStore.save(vacancy.id, imageToStore);
          return c.json(vacancy);
        },
      )

      .get("/vacancies/:id", async (c) => {
        const vacancy = await repo.get(c.req.param("id"));
        return vacancy ? c.json(vacancy) : c.json(NOT_FOUND, 404);
      })

      /** Corrige a mano poster y fecha (REQ-005). */
      .patch("/vacancies/:id", async (c) => {
        const manual = parseManualFields(await readBody(c));
        if (!manual.ok) return c.json({ error: manual.error }, 400);
        const vacancy = await repo.update(c.req.param("id"), manual.value);
        return vacancy ? c.json(vacancy) : c.json(NOT_FOUND, 404);
      })

      .delete("/vacancies/:id", async (c) => {
        const id = c.req.param("id");
        await repo.remove(id);
        // Solo tras el commit del borrado: si `remove` falla, la imagen se conserva.
        await imageStore.remove(id);
        return c.json({ ok: true });
      })

      .get("/vacancies/:id/image", async (c) => {
        const image = await imageStore.read(c.req.param("id"));
        if (!image) return c.json({ error: "La vacante no tiene imagen" }, 404);
        return c.body(new Uint8Array(image.bytes), 200, { "Content-Type": image.mediaType });
      })

      .get("/vacancies/:id/match", async (c) => {
        const vacancy = await repo.get(c.req.param("id"));
        if (!vacancy) return c.json(NOT_FOUND, 404);
        return c.json(await retrieve(vacancy));
      })
  );
}
