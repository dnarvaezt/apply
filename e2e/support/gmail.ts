import type { GmailConnectStart, GmailStatus } from "@apply/shared";
import { type APIRequestContext, expect } from "@playwright/test";

export const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;
/** Google falso del stack (ver `GOOGLE_PORT` en playwright.config.ts). */
export const FAKE_GOOGLE = `http://127.0.0.1:${Number(process.env.E2E_API_PORT ?? 3101) + 2000}`;

/** El Google falso aprueba solo: seguir la URL de consentimiento deja el token en el loopback. */
export async function ensureGmailConnected(request: APIRequestContext) {
  const status = (await (await request.get(`${API}/gmail/status`)).json()) as GmailStatus;
  if (status.state === "connected") return;
  const start = (await (await request.post(`${API}/gmail/connect`)).json()) as GmailConnectStart;
  expect((await request.get(start.authUrl)).ok()).toBe(true);
  await expect
    .poll(
      async () => ((await (await request.get(`${API}/gmail/status`)).json()) as GmailStatus).state,
    )
    .toBe("connected");
}
