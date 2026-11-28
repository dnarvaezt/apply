import { createHash, randomBytes } from "node:crypto";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  applicationContacts,
  applicationEvents,
  applications,
  channels,
  companies,
  contacts,
  createDb,
  cvs,
  gmailSyncState,
  outboundEmails,
  platforms,
  profileChunks,
  vacancies,
} from "../index.ts";

const db = createDb(inject("testDatabaseUrl"));

async function platformId(slug = "linkedin"): Promise<number> {
  const [row] = await db.select().from(platforms).where(eq(platforms.slug, slug));
  if (!row) throw new Error(`plataforma ${slug} no sembrada`);
  return row.id;
}

async function newVacancy(overrides: Partial<typeof vacancies.$inferInsert> = {}) {
  const [row] = await db
    .insert(vacancies)
    .values({
      platformId: await platformId(),
      source: "url",
      sourceUrl: "https://example.com/job/1",
      title: "Ingeniero",
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("vacante no creada");
  return row;
}

async function newApplication(vacancyId: number) {
  const [row] = await db.insert(applications).values({ vacancyId }).returning();
  if (!row) throw new Error("postulación no creada");
  return row;
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    // drizzle envuelve el error de postgres.js en `cause`.
    const cause = (error as { cause?: Error }).cause;
    return `${(error as Error).message} ${cause?.message ?? ""}`;
  }
  throw new Error("se esperaba un rechazo de la base de datos");
}

describe("esquema real contra Postgres + pgvector", () => {
  beforeEach(async () => {
    // Las tablas semilla (platforms, channels) se conservan.
    await db.execute(sql`TRUNCATE
      application_contacts, application_events, outbound_emails, match_reports, cvs,
      applications, contacts, vacancies, companies, profile_chunks, gmail_sync_state
      RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("AC-002: guarda dos postulaciones para la misma vacante", async () => {
    const vacancy = await newVacancy();
    await newApplication(vacancy.id);
    await newApplication(vacancy.id);
    const rows = await db.select().from(applications).where(eq(applications.vacancyId, vacancy.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "applied")).toBe(true);
    expect(rows[0]?.updatedAt).toBeInstanceOf(Date);
    expect(rows[0]?.classifiedAt).toBeNull();
  });

  it("AC-003: rechaza status = 'draft' y acepta los nueve estados", async () => {
    const vacancy = await newVacancy();
    const message = await rejection(
      db.execute(
        sql`INSERT INTO applications (vacancy_id, status) VALUES (${vacancy.id}, 'draft')`,
      ),
    );
    expect(message).toMatch(/invalid input value for enum|draft/i);

    const statuses = [
      "applied",
      "contacted",
      "interview",
      "offer",
      "offer_accepted",
      "offer_declined",
      "rejected",
      "withdrawn",
      "closed",
    ] as const;
    for (const status of statuses) {
      await db.insert(applications).values({ vacancyId: vacancy.id, status });
    }
    expect(await db.select().from(applications)).toHaveLength(statuses.length);
  });

  it("#19: un correo es borrador de un CV o pertenece a una postulación, nunca de ninguno", async () => {
    const [cv] = await db
      .insert(cvs)
      .values({ content: "# CV", language: "es" })
      .returning({ id: cvs.id });
    if (!cv) throw new Error("cv no creado");
    const draft = { subject: "Postulación", body: "Hola", language: "es" };
    await db.insert(outboundEmails).values({ ...draft, cvId: cv.id, toAddress: null });
    const message = await rejection(db.insert(outboundEmails).values(draft));
    expect(message).toMatch(/outbound_emails_owner/);
  });

  it("AC-004: message_id_header UNIQUE y gmail_message_id admite NULL repetido", async () => {
    const app = await newApplication((await newVacancy()).id);
    const email = {
      applicationId: app.id,
      toAddress: "rrhh@example.com",
      subject: "Postulación",
      body: "Hola",
      language: "es",
      messageIdHeader: "<abc@example.com>",
    };
    await db.insert(outboundEmails).values(email);
    const message = await rejection(db.insert(outboundEmails).values(email));
    expect(message).toMatch(/duplicate key|unique/i);

    const event = {
      applicationId: app.id,
      type: "applied",
      occurredAt: new Date(),
      source: "auto" as const,
    };
    await db.insert(applicationEvents).values([
      { ...event, type: "applied" },
      { ...event, type: "contacted" },
    ]);
    expect(await db.select().from(applicationEvents)).toHaveLength(2);

    const withId = { ...event, gmailMessageId: "gm-1" } as typeof applicationEvents.$inferInsert;
    await db.insert(applicationEvents).values(withId);
    expect(await rejection(db.insert(applicationEvents).values(withId))).toMatch(
      /duplicate key|unique/i,
    );
  });

  it("AC-004: los eventos aceptan reopened y rechazan tipos o fuentes inválidos", async () => {
    const app = await newApplication((await newVacancy()).id);
    await db.insert(applicationEvents).values({
      applicationId: app.id,
      type: "reopened",
      occurredAt: new Date(),
      source: "manual",
    });
    expect(
      await rejection(
        db.execute(
          sql`INSERT INTO application_events (application_id, type, occurred_at, source) VALUES (${app.id}, 'draft', now(), 'auto')`,
        ),
      ),
    ).toMatch(/enum/i);
    expect(
      await rejection(
        db.execute(
          sql`INSERT INTO application_events (application_id, type, occurred_at, source) VALUES (${app.id}, 'applied', now(), 'robot')`,
        ),
      ),
    ).toMatch(/enum/i);
  });

  it("REQ-008: application_events es append-only (UPDATE y DELETE fallan)", async () => {
    const app = await newApplication((await newVacancy()).id);
    const [event] = await db
      .insert(applicationEvents)
      .values({ applicationId: app.id, type: "applied", occurredAt: new Date(), source: "auto" })
      .returning();
    if (!event) throw new Error("evento no creado");
    expect(
      await rejection(
        db.update(applicationEvents).set({ notes: "x" }).where(eq(applicationEvents.id, event.id)),
      ),
    ).toMatch(/append-only/i);
    expect(
      await rejection(db.delete(applicationEvents).where(eq(applicationEvents.id, event.id))),
    ).toMatch(/append-only/i);
    expect(Object.keys(getTableColumns(applicationEvents))).not.toContain("updatedAt");
  });

  it("AC-005: guarda y lee un PDF con su sha256 sin pérdida de bytes", async () => {
    const app = await newApplication((await newVacancy()).id);
    const pdf = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      randomBytes(4096),
      Buffer.from([0, 255, 0]),
    ]);
    const sha = createHash("sha256").update(pdf).digest("hex");
    await db.insert(outboundEmails).values({
      applicationId: app.id,
      toAddress: "rrhh@example.com",
      subject: "CV",
      body: "Adjunto",
      language: "es",
      pdf,
      pdfSha256: sha,
    });
    const [row] = await db.select().from(outboundEmails);
    expect(row?.status).toBe("draft");
    expect(Buffer.compare(Buffer.from(row?.pdf ?? []), pdf)).toBe(0);
    expect(
      createHash("sha256")
        .update(Buffer.from(row?.pdf ?? []))
        .digest("hex"),
    ).toBe(row?.pdfSha256);
  });

  it("REQ-011: outbound_emails.status solo admite draft|sending|sent|failed", async () => {
    const app = await newApplication((await newVacancy()).id);
    for (const status of ["draft", "sending", "sent", "failed"] as const) {
      await db.insert(outboundEmails).values({
        applicationId: app.id,
        toAddress: "a@b.c",
        subject: "s",
        body: "b",
        language: "es",
        status,
      });
    }
    expect(
      await rejection(
        db.execute(
          sql`INSERT INTO outbound_emails (application_id, to_address, subject, body, language, status) VALUES (${app.id}, 'a@b.c', 's', 'b', 'es', 'queued')`,
        ),
      ),
    ).toMatch(/enum/i);
  });

  it("AC-006: guarda un vector de 384 dimensiones y rechaza otra dimensión", async () => {
    const embedding = Array.from({ length: 384 }, (_, i) => i / 384);
    await db.insert(profileChunks).values({
      sourcePath: "profile/a.md",
      sourceHash: "h1",
      chunkIndex: 0,
      content: "texto",
      embedding,
      embedModel: "Xenova/all-MiniLM-L6-v2",
    });
    const [row] = await db.select().from(profileChunks);
    expect(row?.embedding).toHaveLength(384);
    expect(row?.embedding?.[1]).toBeCloseTo(1 / 384, 5);
    expect(row?.embedModel).toBe("Xenova/all-MiniLM-L6-v2");

    const wrong = Array.from({ length: 383 }, () => 0.1);
    const message = await rejection(
      db.insert(profileChunks).values({
        sourcePath: "profile/a.md",
        sourceHash: "h1",
        chunkIndex: 1,
        content: "texto",
        embedding: wrong,
        embedModel: "m",
      }),
    );
    expect(message).toMatch(/dimensions|384/i);
  });

  it("AC-007: lee las plataformas y canales sembrados", async () => {
    const channelSlugs = (await db.select().from(channels)).map((c) => c.slug).sort();
    expect(channelSlugs).toEqual(["ats", "email", "linkedin", "other", "phone", "whatsapp"]);
    const platformSlugs = (await db.select().from(platforms)).map((p) => p.slug);
    expect(platformSlugs).toContain("linkedin");
  });

  it("REQ-002/009: admite plataformas y canales nuevos sin cambiar el esquema", async () => {
    await db.insert(platforms).values({ slug: "indeed", name: "Indeed" });
    await db.insert(channels).values({ slug: "telegram", name: "Telegram" });
    expect(await platformId("indeed")).toBeGreaterThan(0);
    await db.delete(platforms).where(eq(platforms.slug, "indeed"));
    await db.delete(channels).where(eq(channels.slug, "telegram"));
  });

  it("AC-008: vacante sin fecha (unknown) y vacante con poster y fecha relativa", async () => {
    const unknown = await newVacancy({ postedAt: null, postedAtPrecision: "unknown" });
    expect(unknown.postedAt).toBeNull();
    expect(unknown.postedAtPrecision).toBe("unknown");

    const relative = await newVacancy({
      sourceUrl: "https://example.com/job/2",
      postedAt: new Date("2026-11-20T00:00:00Z"),
      postedAtPrecision: "relative",
      posterName: "Ana Pérez",
      posterTitle: "Tech Recruiter",
      posterProfileUrl: "https://linkedin.com/in/ana",
    });
    const [row] = await db.select().from(vacancies).where(eq(vacancies.id, relative.id));
    expect(row?.posterName).toBe("Ana Pérez");
    expect(row?.posterTitle).toBe("Tech Recruiter");
    expect(row?.posterProfileUrl).toBe("https://linkedin.com/in/ana");
    expect(row?.postedAtPrecision).toBe("relative");
    expect(row?.source).toBe("url");

    expect(
      await rejection(
        db.execute(
          sql`INSERT INTO vacancies (platform_id, source, source_url, title, posted_at_precision) VALUES (${await platformId()}, 'url', 'u', 't', 'approx')`,
        ),
      ),
    ).toMatch(/enum/i);
  });

  it("AC-009: registra un contacto marcado como inicio de proceso y lo recupera", async () => {
    const [company] = await db.insert(companies).values({ name: "Acme" }).returning();
    const [contact] = await db
      .insert(contacts)
      .values({ companyId: company?.id, name: "Luis", email: "luis@acme.com" })
      .returning();
    const [other] = await db.insert(contacts).values({ name: "Marta" }).returning();
    const app = await newApplication((await newVacancy({ companyId: company?.id })).id);
    if (!contact || !other) throw new Error("contactos no creados");
    await db.insert(applicationContacts).values([
      { applicationId: app.id, contactId: contact.id, isProcessStart: true },
      { applicationId: app.id, contactId: other.id },
    ]);
    const [start] = await db
      .select({ name: contacts.name, email: contacts.email })
      .from(applicationContacts)
      .innerJoin(contacts, eq(contacts.id, applicationContacts.contactId))
      .where(eq(applicationContacts.isProcessStart, true));
    expect(start).toEqual({ name: "Luis", email: "luis@acme.com" });
  });

  it("REQ-010: solo un contacto puede ser inicio de proceso por postulación", async () => {
    const [a] = await db.insert(contacts).values({ name: "A" }).returning();
    const [b] = await db.insert(contacts).values({ name: "B" }).returning();
    const app = await newApplication((await newVacancy()).id);
    if (!a || !b) throw new Error("contactos no creados");
    await db
      .insert(applicationContacts)
      .values({ applicationId: app.id, contactId: a.id, isProcessStart: true });
    expect(
      await rejection(
        db
          .insert(applicationContacts)
          .values({ applicationId: app.id, contactId: b.id, isProcessStart: true }),
      ),
    ).toMatch(/duplicate key|unique/i);
  });

  it("AC-010: gmail_sync_state no tiene columnas de token", () => {
    const names = getTableConfig(gmailSyncState).columns.map((c) => c.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => /token|secret|refresh|credential/i.test(n))).toEqual([]);
  });

  it("AC-010: la base real de gmail_sync_state no tiene columnas de token", async () => {
    const rows = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'gmail_sync_state'`,
    );
    const names = [...rows].map((r) => String(r.column_name));
    expect(names).toContain("history_id");
    expect(names.filter((n) => /token|secret|refresh|credential/i.test(n))).toEqual([]);
  });

  it("REQ-004: cvs no guarda el binario del PDF", async () => {
    const rows = await db.execute(
      sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cvs'`,
    );
    expect([...rows].filter((r) => r.data_type === "bytea")).toEqual([]);
  });

  it("REQ-005: match_reports se liga a cv_id y guarda modelo, embed_model y pesos", async () => {
    const vacancy = await newVacancy();
    const cvRows = await db.execute(
      sql`INSERT INTO cvs (vacancy_id, content, language) VALUES (${vacancy.id}, '# CV', 'es') RETURNING id`,
    );
    const cvId = Number([...cvRows][0]?.id);
    await db.execute(
      sql`INSERT INTO match_reports (cv_id, vacancy_id, score, summary, model, embed_model, weights, cv_hash, report)
          VALUES (${cvId}, ${vacancy.id}, 0.8, 'ok', 'claude', 'minilm', ${JSON.stringify({ skills: 0.6, seniority: 0.4 })}::jsonb, 'h', '{}'::jsonb)`,
    );
    const rows = await db.execute(sql`SELECT model, embed_model, weights FROM match_reports`);
    expect([...rows][0]).toMatchObject({
      model: "claude",
      embed_model: "minilm",
      weights: { skills: 0.6, seniority: 0.4 },
    });
    expect(
      await rejection(
        db.execute(
          sql`INSERT INTO match_reports (cv_id, vacancy_id, score, summary, model, embed_model, weights, cv_hash, report) VALUES (99999, ${vacancy.id}, 0.5, 's', 'm', 'e', '{}'::jsonb, 'h', '{}'::jsonb)`,
        ),
      ),
    ).toMatch(/foreign key|violates/i);
  });
});
