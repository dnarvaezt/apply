import { createServer, type Server } from "node:http";

/** CV que "redacta" Claude, en trozos como en un stream real. */
export const FAKE_CV_CHUNKS = [
  "# Ana Pérez\n\n**Ingeniera Backend**\n\n",
  "ana@example.com · Remoto\n\n## Resumen\n\n",
  "Ingeniera con experiencia en TypeScript y PostgreSQL.\n",
];

const usage = { input_tokens: 10, output_tokens: 20 };
const base = { id: "msg_e2e", type: "message", role: "assistant", model: "fake-e2e" };

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Servidor Anthropic falso para el E2E: la API real lo usa vía `ANTHROPIC_BASE_URL`, así que el
 * código de producción no cambia y ninguna prueba toca la API real. Solo sirve la generación del
 * CV por SSE (hasta #54); la vacante y el correo los resuelve el `claude` falso (fake-claude.ts).
 */
export function startFakeAnthropic(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(req.url === "/health" ? 200 : 404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(
        sse("message_start", {
          type: "message_start",
          message: { ...base, content: [], stop_reason: null, stop_sequence: null, usage },
        }),
      );
      res.write(
        sse("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      for (const text of FAKE_CV_CHUNKS) {
        res.write(
          sse("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text },
          }),
        );
      }
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      res.write(
        sse("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 20 },
        }),
      );
      res.end(sse("message_stop", { type: "message_stop" }));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
