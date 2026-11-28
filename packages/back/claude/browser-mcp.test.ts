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
        "--no-usage-statistics",
      ],
    });
    expect(mcp.allowedTools.every((t) => t.startsWith("mcp__chrome-devtools__"))).toBe(true);
    expect(mcp.allowedTools).not.toContain("mcp__chrome-devtools__evaluate_script");
    expect(mcp.allowedTools).not.toContain("mcp__chrome-devtools__click");
  });

  it("con browserUrl se conecta al Chrome abierto", () => {
    const mcp = buildBrowserMcp({
      node: "/n",
      serverBin: "/s.js",
      target: { browserUrl: "http://127.0.0.1:9222" },
    });
    expect(server(mcp.config)?.args).toEqual([
      "/s.js",
      "--browserUrl",
      "http://127.0.0.1:9222",
      "--no-usage-statistics",
    ]);
  });
});

describe("resolveBrowserMcpBin", () => {
  it("apunta al binario instalado de chrome-devtools-mcp", () => {
    const bin = resolveBrowserMcpBin();
    expect(bin).toMatch(/chrome-devtools-mcp.*chrome-devtools-mcp\.js$/);
    expect(existsSync(bin)).toBe(true);
  });
});
