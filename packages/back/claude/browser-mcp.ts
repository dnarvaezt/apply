import { createRequire } from "node:module";
import path from "node:path";

/**
 * Claude abre la vacante en una pestaña nueva, espera, la lee y la cierra: sin clics, formularios ni
 * scripts, y sin `navigate_page`, que movería la pestaña que el usuario tiene seleccionada.
 */
export const BROWSER_TOOLS = [
  "mcp__chrome-devtools__new_page",
  "mcp__chrome-devtools__wait_for",
  "mcp__chrome-devtools__take_snapshot",
  "mcp__chrome-devtools__close_page",
];

/**
 * Un snapshot de una vacante de LinkedIn ronda los 40 000 caracteres. Por encima de MAX_MCP_OUTPUT_TOKENS
 * la CLI guarda el resultado en un archivo que Claude no puede leer (sin herramientas) y la vacante sale vacía.
 */
const MCP_OUTPUT_TOKENS = "100000";

export type BrowserMcp = { config: string; allowedTools: string[]; env: Record<string, string> };

/**
 * `userDataDir`: el Chrome abierto del usuario, con sus sesiones (p. ej. LinkedIn).
 * `chromePath`: un Chrome headless con un perfil temporal que se borra al cerrar.
 */
export type BrowserTarget = { userDataDir: string } | { chromePath: string };

/** `--mcp-config` del servidor chrome-devtools. */
export function buildBrowserMcp(input: {
  node: string;
  serverBin: string;
  target: BrowserTarget;
}): BrowserMcp {
  const target =
    "userDataDir" in input.target
      ? ["--autoConnect", "--userDataDir", input.target.userDataDir]
      : ["--headless", "--isolated", "--executablePath", input.target.chromePath];
  const server = {
    command: input.node,
    // Pestañas en segundo plano: el usuario sigue usando su Chrome mientras Claude lee.
    args: [input.serverBin, ...target, "--backgroundNewPages", "--no-usage-statistics"],
  };
  return {
    config: JSON.stringify({ mcpServers: { "chrome-devtools": server } }),
    allowedTools: BROWSER_TOOLS,
    env: { MAX_MCP_OUTPUT_TOKENS: MCP_OUTPUT_TOKENS },
  };
}

/** Ruta del binario de `chrome-devtools-mcp`, dependencia declarada de @apply/back. */
export function resolveBrowserMcpBin(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("chrome-devtools-mcp/package.json");
  const { bin } = require(manifest) as { bin: Record<string, string> };
  return path.join(path.dirname(manifest), bin["chrome-devtools-mcp"]);
}
