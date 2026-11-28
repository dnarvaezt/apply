import type { TestProject } from "vitest/node";
import { type EphemeralPostgres, startEphemeralPostgres } from "./ephemeral-postgres.ts";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

let postgres: EphemeralPostgres | undefined;

/** Levanta un Postgres+pgvector efímero con su propia base `apply_test` y le aplica las migraciones. */
export async function setup(project: TestProject): Promise<void> {
  postgres = await startEphemeralPostgres();
  project.provide("testDatabaseUrl", postgres.url);
}

export async function teardown(): Promise<void> {
  await postgres?.stop();
}
