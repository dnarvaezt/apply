import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromeAcceptsDebugging, chromeUserDataDir, findChromePath } from "./chrome.ts";

describe("findChromePath", () => {
  it("prefiere CHROME_PATH si existe", () => {
    expect(findChromePath({ CHROME_PATH: process.execPath })).toBe(process.execPath);
  });
});

describe("chromeUserDataDir (#71)", () => {
  it("usa la carpeta del Chrome estable del usuario por defecto", () => {
    expect(chromeUserDataDir({})).toBe(path.join(homedir(), ".config", "google-chrome"));
  });

  it("CHROME_USER_DATA_DIR la cambia", () => {
    expect(chromeUserDataDir({ CHROME_USER_DATA_DIR: " /x/chrome " })).toBe("/x/chrome");
  });
});

describe("chromeAcceptsDebugging (#71)", () => {
  it("es true solo si Chrome publicó DevToolsActivePort (depuración remota activada)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "apply-chrome-"));
    expect(chromeAcceptsDebugging(dir)).toBe(false);
    writeFileSync(path.join(dir, "DevToolsActivePort"), "9222\n/devtools/browser/x");
    expect(chromeAcceptsDebugging(dir)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
