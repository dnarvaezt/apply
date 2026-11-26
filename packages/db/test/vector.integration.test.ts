import { asc, cosineDistance, sql } from "drizzle-orm";
import { integer, pgTable, text, vector } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDb } from "../index.ts";

const items = pgTable("vector_probe", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  label: text("label").notNull(),
  embedding: vector("embedding", { dimensions: 3 }).notNull(),
});

describe("pgvector con cosineDistance de Drizzle", () => {
  const db = createDb(inject("testDatabaseUrl"));

  beforeAll(async () => {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(
      sql`CREATE TABLE vector_probe (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text NOT NULL, embedding vector(3) NOT NULL)`,
    );
    await db.insert(items).values([
      { label: "x", embedding: [1, 0, 0] },
      { label: "xy", embedding: [1, 1, 0] },
      { label: "y", embedding: [0, 1, 0] },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`DROP TABLE vector_probe`);
    await db.$client.end();
  });

  it("ordena por distancia coseno ascendente", async () => {
    const q = [1, 0.1, 0];
    const distance = cosineDistance(items.embedding, q);
    const rows = await db
      .select({ label: items.label, distance })
      .from(items)
      .orderBy(asc(distance));
    expect(rows.map((r) => r.label)).toEqual(["x", "xy", "y"]);
    expect(rows[0]?.distance).toBeCloseTo(1 - 1 / Math.hypot(1, 0.1), 5);
  });
});
