import { describe, expect, it } from "vitest";
import { healthRoutes } from "./routes.ts";

describe("GET /health (AC-006, REQ-005)", () => {
  const app = (exists: boolean) =>
    healthRoutes({
      config: () => ({ bin: "/x/claude", model: "modelo-x", timeoutMs: 1 }),
      binaryExists: async (bin) => {
        expect(bin).toBe("/x/claude");
        return exists;
      },
    });

  it("reporta el modelo configurado y que el binario existe", async () => {
    const res = await app(true).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: "modelo-x", claudeBinary: true });
  });

  it("reporta que el binario no existe sin fallar", async () => {
    const res = await app(false).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: "modelo-x", claudeBinary: false });
  });
});
