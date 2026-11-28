import { readFileSync } from "node:fs";
import path from "node:path";
import { asc, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applications, contacts, vacancies, vacancyContacts, vacancyStatusChanges } from "#db";
import { newVacancy } from "../../test/fixtures.ts";
import { createIsolatedDb, type IsolatedDb } from "../../test/test-db.ts";
import { createVacanciesRepository } from "../../vacancies/repository.ts";

// La migración 0011 (#80) lleva el estado y los contactos de la postulación a la vacante. Se
// reproduce el esquema previo y se aplican las sentencias reales del archivo de migración.
const MIGRATION = readFileSync(
  path.resolve(import.meta.dirname, "../drizzle/0011_vacancy_process.sql"),
  "utf8",
);

const UNDO = `
  CREATE TABLE application_contacts (
    application_id integer NOT NULL REFERENCES applications(id),
    contact_id integer NOT NULL REFERENCES contacts(id),
    is_process_start boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (application_id, contact_id)
  );
  DROP TABLE vacancy_contacts;
  DROP TABLE vacancy_status_changes;
  ALTER TABLE vacancies DROP CONSTRAINT vacancies_discard_reason;
  ALTER TABLE vacancies DROP COLUMN status, DROP COLUMN discard_reason;
  DROP TYPE vacancy_status;
  DROP TYPE discard_reason;
`;

let iso: IsolatedDb;

beforeAll(async () => {
  iso = await createIsolatedDb();
});

afterAll(async () => {
  await iso.drop();
});

describe("migración 0011: el proceso pasa de la postulación a la vacante (#80)", () => {
  it("toma el estado de la postulación más reciente, abre el historial y mueve los contactos", async () => {
    const repo = createVacanciesRepository(iso.db);
    const offer = Number((await repo.create(newVacancy({ title: "Oferta" }))).id);
    const rejected = Number((await repo.create(newVacancy({ title: "Rechazo" }))).id);
    const accepted = Number((await repo.create(newVacancy({ title: "Aceptada" }))).id);
    const untouched = Number((await repo.create(newVacancy({ title: "Sin postular" }))).id);
    await iso.db.execute(sql.raw(UNDO));

    const app = async (vacancyId: number, status: string, updatedAt: string) => {
      const [row] = await iso.db.execute<{ id: number }>(
        sql`INSERT INTO applications (vacancy_id, status, updated_at)
            VALUES (${vacancyId}, ${status}, ${updatedAt}) RETURNING id`,
      );
      return Number(row?.id);
    };
    await app(offer, "rejected", "2026-01-01T00:00:00Z");
    const current = await app(offer, "offer", "2026-02-01T00:00:00Z");
    await app(rejected, "rejected", "2026-01-10T00:00:00Z");
    await app(accepted, "offer_accepted", "2026-01-20T00:00:00Z");
    const [luis, marta] = await iso.db
      .insert(contacts)
      .values([{ name: "Luis" }, { name: "Marta" }])
      .returning({ id: contacts.id });
    await iso.db.execute(
      sql`INSERT INTO application_contacts (application_id, contact_id, is_process_start)
          VALUES (${current}, ${luis?.id}, true), (${current}, ${marta?.id}, false)`,
    );

    for (const statement of MIGRATION.split("--> statement-breakpoint")) {
      await iso.db.execute(sql.raw(statement));
    }

    const rows = await iso.db
      .select({ id: vacancies.id, status: vacancies.status, reason: vacancies.discardReason })
      .from(vacancies)
      .orderBy(asc(vacancies.id));
    expect(rows).toEqual([
      { id: offer, status: "offer", reason: null },
      { id: rejected, status: "discarded", reason: "rejected" },
      { id: accepted, status: "hired", reason: null },
      { id: untouched, status: "to_apply", reason: null },
    ]);

    const history = await iso.db
      .select({
        vacancyId: vacancyStatusChanges.vacancyId,
        from: vacancyStatusChanges.fromStatus,
        to: vacancyStatusChanges.toStatus,
        occurredAt: vacancyStatusChanges.occurredAt,
      })
      .from(vacancyStatusChanges)
      .orderBy(asc(vacancyStatusChanges.vacancyId));
    expect(history).toEqual([
      { vacancyId: offer, from: null, to: "offer", occurredAt: new Date("2026-02-01T00:00:00Z") },
      {
        vacancyId: rejected,
        from: null,
        to: "discarded",
        occurredAt: new Date("2026-01-10T00:00:00Z"),
      },
      {
        vacancyId: accepted,
        from: null,
        to: "hired",
        occurredAt: new Date("2026-01-20T00:00:00Z"),
      },
    ]);

    const linked = await iso.db
      .select({
        vacancyId: vacancyContacts.vacancyId,
        contactId: vacancyContacts.contactId,
        start: vacancyContacts.isProcessStart,
      })
      .from(vacancyContacts)
      .orderBy(asc(vacancyContacts.contactId));
    expect(linked).toEqual([
      { vacancyId: offer, contactId: luis?.id, start: true },
      { vacancyId: offer, contactId: marta?.id, start: false },
    ]);
    expect(await iso.db.select().from(applications)).toHaveLength(4);
  });
});
