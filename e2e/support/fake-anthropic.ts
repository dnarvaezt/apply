import { createServer, type Server } from "node:http";

/** Vacante que "extrae" Claude en el E2E; el texto pegado en la prueba no importa. */
export const FAKE_VACANCY = {
  title: "Ingeniera Backend E2E",
  company: "ACME S.A.",
  location: "Remoto",
  seniority: "Senior",
  language: "es",
  summary: "Construir y operar APIs sobre Postgres.",
  mustHave: ["TypeScript", "PostgreSQL"],
  niceToHave: ["Docker"],
  responsibilities: ["Diseñar servicios", "Revisar código"],
  keywords: ["typescript", "postgres"],
  posterName: "Laura Gómez",
  posterTitle: "Technical Recruiter",
  postedAtText: "hace 3 días",
};

/** Correo de postulación que "redacta" Claude (#19): sin saludo, lo agrega la API. */
export const FAKE_EMAIL = {
  subject: "Postulación: Ingeniera Backend E2E",
  body: "Me interesa el rol de Ingeniera Backend en ACME.\n\nSaludos,\nAna Pérez",
  language: "es",
};

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
 * código de producción no cambia y ninguna prueba toca la API real. `stream: true` devuelve el CV
 * por SSE; una petición con el esquema del correo (`subject`) devuelve el correo, y el resto la
 * extracción de la vacante como JSON.
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
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      const body = JSON.parse(raw) as { stream?: boolean };
      if (!body.stream) {
        const output = raw.includes('"subject"') ? FAKE_EMAIL : FAKE_VACANCY;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ...base,
            content: [{ type: "text", text: JSON.stringify(output) }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage,
          }),
        );
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
