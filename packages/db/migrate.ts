import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.ts";

const migrationsFolder = path.resolve(import.meta.dirname, "drizzle");

/** Aplica las migraciones versionadas (incluye la semilla y la extensión `vector`). Idempotente. */
export async function runMigrations(url: string): Promise<void> {
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}

/** Punto de entrada de `npm run db:migrate`: lee `DATABASE_URL`. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL no está definida; db:migrate no sabe a qué base conectarse.");
  }
  await runMigrations(url);
  console.log("Migraciones aplicadas.");
}

if (process.argv[1] === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
