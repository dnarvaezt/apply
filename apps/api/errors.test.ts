import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { ClaudeCliError, notFoundError, parseStreamLine } from "./claude/cli.ts";
import { apiErrorHandler } from "./errors.ts";

async function respond(error: unknown): Promise<{ status: number; body: unknown }> {
  const app = new Hono();
  app.onError(apiErrorHandler);
  app.get("/boom", () => {
    throw error;
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const res = await app.request("/boom");
  return { status: res.status, body: await res.json() };
}

describe("onError sin SDK (AC-005, REQ-004)", () => {
  it("binario ausente: dice cómo instalarlo o definir CLAUDE_BIN", async () => {
    expect(await respond(notFoundError("claude"))).toEqual({
      status: 500,
      body: {
        error: "No se encontró el binario de Claude (claude). Instala la CLI o define CLAUDE_BIN.",
      },
    });
  });

  it("result con is_error: muestra el detalle de Claude", async () => {
    const { body } = await respond(new ClaudeCliError("failed", "Claude falló: se cayó"));
    expect(body).toEqual({ error: "Claude falló: se cayó" });
  });

  it("fallo de autenticación: pide iniciar sesión con /login", async () => {
    const event = parseStreamLine(
      JSON.stringify({ type: "system", subtype: "api_retry", error: "authentication_failed" }),
    );
    if (event.kind !== "failure") throw new Error("se esperaba failure");
    expect(await respond(event.failure)).toEqual({
      status: 500,
      body: {
        error:
          "Claude no está autenticado. Abre `claude` en una terminal e inicia sesión con /login.",
      },
    });
  });

  it("límite de la suscripción: avisa del límite", async () => {
    const event = parseStreamLine(
      JSON.stringify({ type: "system", subtype: "api_retry", error: "rate_limit" }),
    );
    if (event.kind !== "failure") throw new Error("se esperaba failure");
    expect(await respond(event.failure)).toEqual({
      status: 500,
      body: {
        error:
          "Se alcanzó el límite de uso de la suscripción de Claude; intenta de nuevo más tarde.",
      },
    });
  });

  it("un Error cualquiera conserva su mensaje y se registra en consola", async () => {
    const error = new Error("otro");
    expect((await respond(error)).body).toEqual({ error: "otro" });
    expect(console.error).toHaveBeenCalledWith(error);
  });
});
