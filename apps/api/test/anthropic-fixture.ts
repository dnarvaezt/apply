import Anthropic from "@anthropic-ai/sdk";

/**
 * Cliente Anthropic real cuyo `fetch` responde con un mensaje de fixture (frontera externa, D9).
 * Guarda los cuerpos enviados para afirmar qué se le pidió al modelo.
 */
export function fixtureAnthropic(outputJson: unknown) {
  const requests: Record<string, unknown>[] = [];
  const api = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(
        JSON.stringify({
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          model: "fixture",
          content: [{ type: "text", text: JSON.stringify(outputJson) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  return { api, requests };
}
