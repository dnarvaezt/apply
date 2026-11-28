import { createDb } from "#db";

export type Db = ReturnType<typeof createDb>;
/** Base o transacción: los repositorios aceptan cualquiera de las dos. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

let db: Db | undefined;

/** Cliente único de la API; la conexión es perezosa y lee `DATABASE_URL` en el primer uso. */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL no está definida; la API necesita Postgres (ver .env.example).");
  }
  db = createDb(url);
  return db;
}

export async function closeDb(): Promise<void> {
  await db?.$client.end();
  db = undefined;
}
