import { DISCARD_REASONS, VACANCY_STATUSES } from "@apply/shared";
import { Hono } from "hono";
import { z } from "zod";
import { InvalidMoveError, type ProcessRepository } from "./repository.ts";

export interface ProcessRoutesDeps {
  repo: ProcessRepository;
}

const NOT_FOUND = { error: "Vacante no encontrada" };

/** Margen para relojes desfasados entre el navegador y la API. */
const CLOCK_SKEW_MS = 60_000;

const optionalText = z.string().trim().min(1).nullish();

const moveSchema = z.object({
  to: z.enum(VACANCY_STATUSES),
  discardReason: z.enum(DISCARD_REASONS).nullish(),
  note: optionalText,
  channel: optionalText,
  occurredAt: z.iso
    .datetime({ offset: true })
    .refine(
      (value) => Date.parse(value) <= Date.now() + CLOCK_SKEW_MS,
      "La fecha no puede ser futura",
    )
    .optional(),
});

export function processRoutes({ repo }: ProcessRoutesDeps) {
  return (
    new Hono()
      /** Estado, historial y contactos de la vacante (#80). */
      .get("/vacancies/:id/process", async (c) => {
        const process = await repo.get(c.req.param("id"));
        return process ? c.json(process) : c.json(NOT_FOUND, 404);
      })

      /** Mueve la vacante a otro estado, con nota opcional; responde el proceso actualizado. */
      .post("/vacancies/:id/status", async (c) => {
        const parsed = moveSchema.safeParse(await c.req.json().catch(() => undefined));
        if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
        try {
          const process = await repo.move(c.req.param("id"), parsed.data);
          return process ? c.json(process, 201) : c.json(NOT_FOUND, 404);
        } catch (err) {
          if (err instanceof InvalidMoveError) return c.json({ error: err.message }, 400);
          throw err;
        }
      })
  );
}
