import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../../..");

function urlFor(database: string): string {
  const url = new URL(inject("testDatabaseUrl"));
  url.pathname = `/${database}`;
  return url.toString();
}

describe("npm run db:migrate sobre una base vacía (AC-001)", () => {
  const admin = postgres(inject("testDatabaseUrl"));
  const target = "apply_migrate_empty";

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${target}`);
  });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
    await admin.end();
  });

  it("sale con exit 0, crea la extensión vector y las 13 tablas", async () => {
    const result = spawnSync("npm", ["run", "db:migrate"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: urlFor(target) },
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

    const sql = postgres(urlFor(target));
    try {
      const ext = await sql`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
      expect(ext).toHaveLength(1);
      const tables = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`;
      expect(tables.map((t) => t.table_name)).toEqual([
        "application_contacts",
        "application_events",
        "applications",
        "channels",
        "companies",
        "contacts",
        "cvs",
        "gmail_sync_state",
        "match_reports",
        "outbound_emails",
        "platforms",
        "profile_chunks",
        "vacancies",
      ]);
    } finally {
      await sql.end();
    }
  });

  it("es idempotente: una segunda ejecución también sale con exit 0", () => {
    const result = spawnSync("npm", ["run", "db:migrate"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: urlFor(target) },
      encoding: "utf8",
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("lee DATABASE_URL del archivo .env si el entorno no la trae", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "apply-migrate-env-"));
    const envFile = path.join(dir, ".env");
    writeFileSync(envFile, `DATABASE_URL=${urlFor(target)}\n`);
    const { DATABASE_URL: _omit, ...env } = process.env;
    try {
      const result = spawnSync("npm", ["run", "db:migrate"], {
        cwd: root,
        env: { ...env, APPLY_ENV_FILE: envFile },
        encoding: "utf8",
      });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falla con exit distinto de 0 si falta DATABASE_URL en el entorno y en el .env", () => {
    const { DATABASE_URL: _omit, ...env } = process.env;
    // Un .env inexistente: nunca el del repo, que apunta a la base de desarrollo del usuario.
    const missing = path.join(tmpdir(), "apply-migrate-sin-env", ".env");
    const result = spawnSync("npm", ["run", "db:migrate"], {
      cwd: root,
      env: { ...env, APPLY_ENV_FILE: missing },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DATABASE_URL no está definida");
  });
});
