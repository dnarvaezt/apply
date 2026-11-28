import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Crea el cliente Drizzle; la conexión es perezosa, no abre sockets hasta la primera consulta. */
export function createDb(url: string) {
  return drizzle(postgres(url), { schema });
}
