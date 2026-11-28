import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBrowserMcp, resolveBrowserMcpBin } from "./browser-mcp.ts";

const server = (config: string) =>
  (JSON.parse(config) as { mcpServers: Record<string, { command: string; args: string[] }> })
    .mcpServers["chrome-devtools"];

describe("buildBrowserMcp (#69)", () => {
  it("sin Chrome abierto lanza uno headless con perfil temporal y sin estadísticas", () => {
    const mcp = buildBrowserMcp({
      node: "/n",
      serverBin: "/s.js",
      target: { chromePath: "/usr/bin/chrome" },
    });
    expect(server(mcp.config)).toEqual({
      command: "/n",
      args: [
        "/s.js",
        "--headless",
        "--isolated",
        "--executablePath",
        "/usr/bin/chrome",
        "--backgroundNewPages",
        "--no-usage-statistics",
      ],
    });
    expect(mcp.env).toEqual({ MAX_MCP_OUTPUT_TOKENS: "100000" });
    expect(mcp.allowedTools.every((t) => t.startsWith("mcp__chrome-devtools__"))).toBe(true);
    expect(mcp.allowedTools).not.toContain("mcp__chrome-devtools__evaluate_script");
    expect(mcp.allowedTools).not.toContain("mcp__chrome-devtools__click");
  });

  it("con userDataDir se conecta al Chrome abierto del usuario sin robarle el foco (#71)", () => {
    const mcp = buildBrowserMcp({
      node: "/n",
      serverBin: "/s.js",
      target: { userDataDir: "/home/u/.config/google-chrome" },
    });
    expect(server(mcp.config)?.args).toEqual([
      "/s.js",
      "--autoConnect",
      "--userDataDir",
      "/home/u/.config/google-chrome",
      "--backgroundNewPages",
      "--no-usage-statistics",
    ]);
  });

  it("abre la vacante en una pestaña nueva: no puede navegar la pestaña que el usuario está usando (#71)", () => {
    const { allowedTools } = buildBrowserMcp({
      node: "/n",
      serverBin: "/s.js",
      target: { userDataDir: "/u" },
    });
    expect(allowedTools).toContain("mcp__chrome-devtools__new_page");
    expect(allowedTools).toContain("mcp__chrome-devtools__close_page");
    expect(allowedTools).not.toContain("mcp__chrome-devtools__navigate_page");
    expect(allowedTools).not.toContain("mcp__chrome-devtools__select_page");
  });
});

describe("resolveBrowserMcpBin", () => {
  it("apunta al binario instalado de chrome-devtools-mcp", () => {
    const bin = resolveBrowserMcpBin();
    expect(bin).toMatch(/chrome-devtools-mcp.*chrome-devtools-mcp\.js$/);
    expect(existsSync(bin)).toBe(true);
  });
});
