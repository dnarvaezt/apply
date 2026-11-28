import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { ContactsRepository } from "./repository.ts";

export interface ContactRoutesDeps {
  repo: ContactsRepository;
}

/** Un texto opcional vacío o de solo espacios llega como `null`. */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullish());

const contactSchema = z.object({
  name: z.string().trim().min(1),
  title: optional(z.string().trim()),
  email: optional(z.string().trim().pipe(z.email())),
  phone: optional(z.string().trim()),
  profileUrl: optional(z.string().trim().pipe(z.url())),
  notes: optional(z.string().trim()),
});

const newContactSchema = contactSchema.extend({ isProcessStart: z.boolean().optional() });
const processStartSchema = z.object({ isProcessStart: z.boolean() });

async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<T | string> {
  const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
  return parsed.success ? parsed.data : z.prettifyError(parsed.error);
}

const NOT_FOUND = { error: "Contacto no encontrado" };

export function contactRoutes({ repo }: ContactRoutesDeps) {
  return (
    new Hono()
      /** Crea el contacto y lo vincula a la postulación (REQ-002). */
      .post("/applications/:id/contacts", async (c) => {
        const body = await parseBody(c, newContactSchema);
        if (typeof body === "string") return c.json({ error: body }, 400);
        const created = await repo.addToApplication(c.req.param("id"), body);
        return created ? c.json(created, 201) : c.json({ error: "Postulación no encontrada" }, 404);
      })

      .put("/contacts/:id", async (c) => {
        const body = await parseBody(c, contactSchema);
        if (typeof body === "string") return c.json({ error: body }, 400);
        const updated = await repo.update(c.req.param("id"), body);
        return updated ? c.json(updated) : c.json(NOT_FOUND, 404);
      })

      /** Marca o desmarca el contacto como inicio del proceso (REQ-005, C8). */
      .patch("/applications/:id/contacts/:contactId", async (c) => {
        const body = await parseBody(c, processStartSchema);
        if (typeof body === "string") return c.json({ error: body }, 400);
        const linked = await repo.markProcessStart(
          c.req.param("id"),
          c.req.param("contactId"),
          body.isProcessStart,
        );
        return linked ? c.json(linked) : c.json(NOT_FOUND, 404);
      })
  );
}
