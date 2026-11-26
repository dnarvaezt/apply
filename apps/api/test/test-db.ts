import { randomBytes } from "node:crypto";
import { createDb } from "@apply/db";
import { runMigrations } from "@apply/db/migrate";
import postgres from "postgres";
import { inject } from "vitest";
import type { Db } from "../db.ts";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export interface IsolatedDb {
  db: Db;
  url: string;
  drop: () => Promise<void>;
}

/**
 * Crea una base propia dentro del Postgres efímero (con migraciones) para que cada archivo
 * de pruebas pueda truncar tablas sin pisar a otros archivos que corren en paralelo.
 */
export async function createIsolatedDb(): Promise<IsolatedDb> {
  const base = inject("testDatabaseUrl");
  const name = `apply_t_${randomBytes(6).toString("hex")}`;
  const admin = postgres(base);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());
  const db = createDb(url.toString());
  return {
    db,
    url: url.toString(),
    drop: async () => {
      await db.$client.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
