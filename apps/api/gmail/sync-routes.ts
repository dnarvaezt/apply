import { Hono } from "hono";
import type { ReplySync } from "./sync.ts";

export interface GmailSyncRoutesDeps {
  sync: ReplySync;
}

/** Detección de respuestas (#22): estado y sincronización a pedido. */
export function gmailSyncRoutes({ sync }: GmailSyncRoutesDeps) {
  return new Hono()
    .get("/gmail/sync", async (c) => c.json(await sync.status()))
    .post("/gmail/sync", async (c) => c.json(await sync.run()));
}
