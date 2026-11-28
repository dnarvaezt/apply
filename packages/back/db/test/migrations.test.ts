import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dbDir = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(dbDir, "drizzle");

describe("migraciones versionadas (AC-011)", () => {
  it("drizzle-kit generate no produce diferencias tras la última migración", () => {
    const before = readdirSync(migrationsDir, { recursive: true }).sort();
    const result = spawnSync("npx", ["drizzle-kit", "generate"], { cwd: dbDir, encoding: "utf8" });
    const after = readdirSync(migrationsDir, { recursive: true }).sort();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("No schema changes");
    expect(after).toEqual(before);
  });
});
