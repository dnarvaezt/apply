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

/** `.env` de la raíz del repo, el mismo que lee la API; `APPLY_ENV_FILE` lo reemplaza. */
const ENV_FILE = process.env.APPLY_ENV_FILE ?? path.resolve(import.meta.dirname, "../../.env");

/** Carga el `.env` si existe; las variables ya definidas en el entorno tienen prioridad. */
function loadEnvFile(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!missing) throw error;
  }
}

/** Punto de entrada de `npm run db:migrate`: lee `DATABASE_URL` del entorno o del `.env`. */
async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
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
