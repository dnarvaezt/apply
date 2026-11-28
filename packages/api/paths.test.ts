import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT, CV_THEME_CSS, ENV_FILE, MODELS_DIR, resolveDataDir } from "./paths.ts";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const { CV_DATA_DIR: _omit, ...cleanEnv } = process.env;

function inApiCwd(code: string): string {
  return execFileSync(process.execPath, ["-e", code], {
    cwd: import.meta.dirname,
    env: cleanEnv,
    encoding: "utf8",
  }).trim();
}

describe("AC-003: rutas ancladas a la raíz del repo", () => {
  it("APP_ROOT es la raíz del repo y data/, .cache/models y .env cuelgan de ella", () => {
    expect(APP_ROOT).toBe(repoRoot);
    expect(ENV_FILE).toBe(path.join(repoRoot, ".env"));
    expect(MODELS_DIR).toBe(path.join(repoRoot, ".cache", "models"));
    expect(CV_THEME_CSS).toBe(path.join(repoRoot, "packages", "shared", "cv-theme.css"));
    expect(resolveDataDir(undefined)).toBe(path.join(repoRoot, "data"));
  });

  it("un CV_DATA_DIR relativo se ancla a la raíz y uno absoluto se respeta", () => {
    expect(resolveDataDir("tmp/x")).toBe(path.join(repoRoot, "tmp", "x"));
    expect(resolveDataDir("/abs/dir")).toBe("/abs/dir");
  });

  it("con cwd packages/api, storage resuelve data/ en la raíz y no en el cwd", () => {
    const out = inApiCwd("import('./storage.ts').then(m => console.log(m.DATA_DIR))");
    expect(out).toBe(path.join(repoRoot, "data"));
  });

  it("con cwd packages/api, paths resuelve .cache/models y .env en la raíz", () => {
    const out = inApiCwd(
      "import('./paths.ts').then(m => console.log(JSON.stringify([m.MODELS_DIR, m.ENV_FILE])))",
    );
    expect(JSON.parse(out)).toEqual([
      path.join(repoRoot, ".cache", "models"),
      path.join(repoRoot, ".env"),
    ]);
  });

  it("el CSS del CV existe donde la api lo lee", async () => {
    const { access } = await import("node:fs/promises");
    await expect(access(CV_THEME_CSS)).resolves.toBeUndefined();
  });
});
