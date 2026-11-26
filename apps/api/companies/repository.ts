import { companies } from "@apply/db";
import { sql } from "drizzle-orm";
import type { Executor } from "../db.ts";
import { normalizeCompanyName } from "./normalize.ts";

/** Devuelve el id de la empresa; una sola fila por nombre normalizado, sin carreras. */
export async function upsertCompany(db: Executor, name: string): Promise<number> {
  const [row] = await db
    .insert(companies)
    .values({ name: name.trim(), normalizedName: normalizeCompanyName(name) })
    .onConflictDoUpdate({
      target: companies.normalizedName,
      set: { name: sql`${companies.name}` },
    })
    .returning({ id: companies.id });
  if (!row) throw new Error("No se pudo guardar la empresa");
  return row.id;
}
