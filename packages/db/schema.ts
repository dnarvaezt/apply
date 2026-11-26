import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Esquema mínimo que solo prueba la cadena drizzle-kit generate. El modelo real lo define #10.
export const schemaProbe = pgTable("schema_probe", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
