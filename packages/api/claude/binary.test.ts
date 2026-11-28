import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeBinaryExists } from "./binary.ts";

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function tmp(): string {
  dir = mkdtempSync(path.join(tmpdir(), "claude-bin-"));
  return dir;
}

describe("claudeBinaryExists (REQ-005)", () => {
  it("acepta una ruta absoluta ejecutable", async () => {
    const file = path.join(tmp(), "claude");
    writeFileSync(file, "#!/bin/sh\n");
    chmodSync(file, 0o755);
    expect(await claudeBinaryExists(file, "")).toBe(true);
  });

  it("rechaza una ruta que no existe o no es ejecutable", async () => {
    const file = path.join(tmp(), "claude");
    expect(await claudeBinaryExists(file, "")).toBe(false);
    writeFileSync(file, "x");
    chmodSync(file, 0o644);
    expect(await claudeBinaryExists(file, "")).toBe(false);
  });

  it("busca un nombre sin ruta en cada directorio del PATH", async () => {
    const bin = tmp();
    const file = path.join(bin, "claude");
    writeFileSync(file, "#!/bin/sh\n");
    chmodSync(file, 0o755);
    expect(await claudeBinaryExists("claude", `/no/existe${path.delimiter}${bin}`)).toBe(true);
    expect(await claudeBinaryExists("otro", bin)).toBe(false);
    expect(await claudeBinaryExists("claude", "")).toBe(false);
  });
});
