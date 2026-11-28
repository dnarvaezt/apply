import type { GmailStatus } from "@apply/shared";
import { Hono } from "hono";
import type { GmailConnection } from "./connection.ts";

const NOT_CONFIGURED: GmailStatus = { state: "not_configured", email: null };

export interface GmailRoutesDeps {
  /** `null` sin `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: la app sigue sin Gmail (REQ-007). */
  gmail: GmailConnection | null;
}

export function gmailRoutes({ gmail }: GmailRoutesDeps) {
  return new Hono()
    .get("/gmail/status", async (c) => c.json(gmail ? await gmail.status() : NOT_CONFIGURED))
    .post("/gmail/connect", async (c) =>
      gmail
        ? c.json(await gmail.start())
        : c.json(
            { error: "Gmail no está configurado: define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET" },
            409,
          ),
    );
}
