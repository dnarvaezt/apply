import { APPLICATION_STATUSES } from "@apply/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { type ApplicationsRepository, InvalidEventError } from "./repository.ts";

export interface ApplicationRoutesDeps {
  repo: ApplicationsRepository;
}

const NOT_FOUND = { error: "Postulación no encontrada" };

const source = z.enum(["auto", "manual"]);
const optionalText = z.string().trim().min(1).nullish();

const createSchema = z.object({
  vacancyId: z.string().min(1),
  cvId: optionalText,
  appliedAt: z.iso.datetime({ offset: true }).optional(),
  channel: optionalText,
  source: source.default("manual"),
  notes: optionalText,
});

const eventSchema = z.object({
  type: z.enum([...APPLICATION_STATUSES, "reopened"]),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  channel: optionalText,
  source,
  notes: optionalText,
  gmailMessageId: optionalText,
});

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T | string> {
  const raw = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : z.prettifyError(parsed.error);
}

/** Convierte la entrada inválida del repositorio en 400; el resto de errores sigue su curso. */
async function guard<T>(run: () => Promise<T>): Promise<T | { invalid: string }> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof InvalidEventError) return { invalid: err.message };
    throw err;
  }
}

const isInvalid = (value: unknown): value is { invalid: string } =>
  typeof value === "object" && value !== null && "invalid" in value;

export function applicationRoutes({ repo }: ApplicationRoutesDeps) {
  return (
    new Hono()
      .get("/applications", async (c) => {
        const vacancyId = c.req.query("vacancyId");
        return c.json(await repo.list(vacancyId === undefined ? {} : { vacancyId }));
      })

      .post("/applications", async (c) => {
        const body = await parseBody(c, createSchema);
        if (typeof body === "string") return c.json({ error: body }, 400);
        const created = await guard(() => repo.create(body));
        if (isInvalid(created)) return c.json({ error: created.invalid }, 400);
        return created ? c.json(created, 201) : c.json({ error: "Vacante no encontrada" }, 404);
      })

      /** Línea de tiempo: la postulación con su estado y sus eventos en orden cronológico. */
      .get("/applications/:id", async (c) => {
        const timeline = await repo.timeline(c.req.param("id"));
        return timeline ? c.json(timeline) : c.json(NOT_FOUND, 404);
      })

      .post("/applications/:id/events", async (c) => {
        const body = await parseBody(c, eventSchema);
        if (typeof body === "string") return c.json({ error: body }, 400);
        const result = await guard(() => repo.addEvent(c.req.param("id"), body));
        if (isInvalid(result)) return c.json({ error: result.invalid }, 400);
        if (!result) return c.json(NOT_FOUND, 404);
        return c.json(result, result.duplicate ? 200 : 201);
      })
  );
}
