import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { runMigrations } from "../migrate.ts";
import { assertNotDevDatabase } from "./guard.ts";

export interface EphemeralPostgres {
  /** URL de la base `apply_test` del contenedor, con las migraciones aplicadas. */
  url: string;
  stop: () => Promise<void>;
}

/**
 * Postgres+pgvector efímero con su propia base `apply_test` y las migraciones aplicadas.
 * Lo usan las pruebas de integración de vitest y el E2E de Playwright; nunca la base `apply`.
 */
export async function startEphemeralPostgres(): Promise<EphemeralPostgres> {
  assertNotDevDatabase(process.env.DATABASE_URL);
  const container = await new PostgreSqlContainer("pgvector/pgvector:0.8.7-pg18")
    .withDatabase("apply_test")
    .start();
  const url = container.getConnectionUri();
  assertNotDevDatabase(url);
  await runMigrations(url);
  return { url, stop: () => container.stop().then(() => undefined) };
}
