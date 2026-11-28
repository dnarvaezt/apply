import { Hono } from "hono";
import type { ClaudeConfig } from "../claude/cli.ts";

export interface HealthRoutesDeps {
  config: () => ClaudeConfig;
  binaryExists: (bin: string) => Promise<boolean>;
}

/** El modelo configurado y si el binario `claude` está disponible (la API no usa ninguna API key). */
export function healthRoutes({ config, binaryExists }: HealthRoutesDeps) {
  return new Hono().get("/health", async (c) => {
    const { bin, model } = config();
    return c.json({ ok: true, model, claudeBinary: await binaryExists(bin) });
  });
}
