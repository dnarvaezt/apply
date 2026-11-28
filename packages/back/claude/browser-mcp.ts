import { createRequire } from "node:module";
import path from "node:path";

/** Claude solo puede abrir la página, esperar a que cargue y leerla: sin clics, formularios ni scripts. */
export const BROWSER_TOOLS = [
  "mcp__chrome-devtools__navigate_page",
  "mcp__chrome-devtools__wait_for",
  "mcp__chrome-devtools__take_snapshot",
];

export type BrowserMcp = { config: string; allowedTools: string[] };

/**
 * `browserUrl`: un Chrome ya abierto con `--remote-debugging-port`, que trae tus sesiones (p. ej. LinkedIn).
 * `chromePath`: un Chrome headless con un perfil temporal que se borra al cerrar.
 */
export type BrowserTarget = { browserUrl: string } | { chromePath: string };

/** `--mcp-config` del servidor chrome-devtools. */
export function buildBrowserMcp(input: {
  node: string;
  serverBin: string;
  target: BrowserTarget;
}): BrowserMcp {
  const target =
    "browserUrl" in input.target
      ? ["--browserUrl", input.target.browserUrl]
      : ["--headless", "--isolated", "--executablePath", input.target.chromePath];
  const server = {
    command: input.node,
    args: [input.serverBin, ...target, "--no-usage-statistics"],
  };
  return {
    config: JSON.stringify({ mcpServers: { "chrome-devtools": server } }),
    allowedTools: BROWSER_TOOLS,
  };
}

/** Ruta del binario de `chrome-devtools-mcp`, dependencia declarada de @apply/back. */
export function resolveBrowserMcpBin(): string {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve("chrome-devtools-mcp/package.json");
  const { bin } = require(manifest) as { bin: Record<string, string> };
  return path.join(path.dirname(manifest), bin["chrome-devtools-mcp"]);
}
