import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../migrate.ts";
import { assertNotDevDatabase } from "./guard.ts";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

/** Levanta un Postgres+pgvector efímero con su propia base `apply_test` y le aplica las migraciones. */
export async function setup(project: TestProject): Promise<void> {
  assertNotDevDatabase(process.env.DATABASE_URL);
  container = await new PostgreSqlContainer("pgvector/pgvector:0.8.7-pg18")
    .withDatabase("apply_test")
    .start();
  const url = container.getConnectionUri();
  assertNotDevDatabase(url);
  await runMigrations(url);
  project.provide("testDatabaseUrl", url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
