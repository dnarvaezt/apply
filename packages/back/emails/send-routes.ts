import { type Context, Hono } from "hono";
import { z } from "zod";
import { parseBody } from "./routes.ts";
import type { EmailSender, SendOutcome } from "./send.ts";

export interface EmailSendRoutesDeps {
  sender: EmailSender;
}

/** REQ-001: sin `confirmed: true` no se envía nada (C10). */
const sendSchema = z.object({ confirmed: z.literal(true) });
const resolveSchema = z.object({ sent: z.boolean() });

const STATUS = {
  not_found: 404,
  invalid: 400,
  unavailable: 409,
  conflict: 409,
  rejected: 502,
} as const;

function reply(c: Context, outcome: SendOutcome) {
  switch (outcome.kind) {
    case "ok":
      return c.json(outcome.draft, 200);
    case "pending":
      return c.json(outcome.draft, 202);
    case "not_found":
      return c.json({ error: "Borrador no encontrado" }, STATUS.not_found);
    default:
      return c.json({ error: outcome.message }, STATUS[outcome.kind]);
  }
}

export function emailSendRoutes({ sender }: EmailSendRoutesDeps) {
  return new Hono()
    .post("/email-drafts/:id/send", async (c) => {
      const body = await parseBody(c, sendSchema, undefined);
      if (typeof body === "string") {
        return c.json({ error: `Confirma el envío tras ver la vista previa: ${body}` }, 400);
      }
      return reply(c, await sender.send(c.req.param("id")));
    })
    .post("/email-drafts/:id/resolve", async (c) => {
      const body = await parseBody(c, resolveSchema, undefined);
      if (typeof body === "string") return c.json({ error: body }, 400);
      return reply(c, await sender.resolve(c.req.param("id"), body.sent));
    });
}
