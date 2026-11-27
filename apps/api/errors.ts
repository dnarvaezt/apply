import type { ErrorHandler } from "hono";

/** `onError` de la API: los fallos de la CLI (`ClaudeCliError`) ya traen un mensaje legible. */
export const apiErrorHandler: ErrorHandler = (err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
};
