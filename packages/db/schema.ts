import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** Dimensión de los embeddings (D2). Cambiarla exige migración nueva y reembebido. */
export const EMBEDDING_DIMENSIONS = 384;

/** `bytea` de Postgres como `Buffer` (el PDF del envío). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const applicationStatus = pgEnum("application_status", [
  "applied",
  "contacted",
  "interview",
  "offer",
  "offer_accepted",
  "offer_declined",
  "rejected",
  "withdrawn",
  "closed",
]);

/** Tipo de evento: los estados más `reopened`. */
export const applicationEventType = pgEnum("application_event_type", [
  ...applicationStatus.enumValues,
  "reopened",
]);

export const eventSource = pgEnum("event_source", ["auto", "manual"]);
export const postedAtPrecision = pgEnum("posted_at_precision", ["exact", "relative", "unknown"]);
export const outboundEmailStatus = pgEnum("outbound_email_status", [
  "draft",
  "sending",
  "sent",
  "failed",
]);

/** Plataformas de origen de vacantes; una nueva es una fila, no un cambio de esquema. */
export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  /** Nombre sin mayúsculas, acentos ni puntuación; una sola fila por empresa (REQ-003 de #13). */
  normalizedName: text("normalized_name").unique(),
  websiteUrl: text("website_url"),
  createdAt: createdAt(),
});

export const vacancies = pgTable(
  "vacancies",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Id del archivo en `data/` antes de Postgres; la importación (#14) hace upsert por él. */
    legacyId: text("legacy_id").unique(),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
    source: text("source").notNull(),
    /** `null` cuando la vacante se pegó como texto y no tiene URL. */
    sourceUrl: text("source_url"),
    companyId: integer("company_id").references(() => companies.id),
    title: text("title").notNull(),
    /** Texto original de la vacante (`rawText` del contrato de la API). */
    description: text("description"),
    location: text("location"),
    seniority: text("seniority"),
    language: text("language").notNull().default("es"),
    summary: text("summary").notNull().default(""),
    mustHave: jsonb("must_have").$type<string[]>().notNull().default([]),
    niceToHave: jsonb("nice_to_have").$type<string[]>().notNull().default([]),
    responsibilities: jsonb("responsibilities").$type<string[]>().notNull().default([]),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedAtPrecision: postedAtPrecision("posted_at_precision").notNull().default("unknown"),
    posterName: text("poster_name"),
    posterTitle: text("poster_title"),
    posterProfileUrl: text("poster_profile_url"),
    createdAt: createdAt(),
  },
  (t) => [index("vacancies_platform_id_idx").on(t.platformId)],
);

/** Fragmentos del perfil con su embedding; búsqueda exacta, sin índice ANN (D2). */
export const profileChunks = pgTable(
  "profile_chunks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sourcePath: text("source_path").notNull(),
    sourceHash: text("source_hash").notNull(),
    sourceMtime: timestamp("source_mtime", { withTimezone: true }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    embedModel: text("embed_model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("profile_chunks_source_chunk_uq").on(t.sourcePath, t.chunkIndex)],
);

/** CVs generados. El PDF no se guarda: es regenerable (C1). */
export const cvs = pgTable(
  "cvs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Id del archivo en `data/` antes de Postgres; la importación (#14) hace upsert por él. */
    legacyId: text("legacy_id").unique(),
    /** `null` si la vacante se borró: el CV sobrevive sin referencia colgante. */
    vacancyId: integer("vacancy_id").references(() => vacancies.id),
    title: text("title").notNull().default(""),
    content: text("content").notNull(),
    language: text("language").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("cvs_vacancy_id_idx").on(t.vacancyId)],
);

export const matchReports = pgTable(
  "match_reports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cvId: integer("cv_id")
      .notNull()
      .references(() => cvs.id),
    vacancyId: integer("vacancy_id")
      .notNull()
      .references(() => vacancies.id),
    /** Cobertura ponderada de `mustHave` (D6); no hay puntaje global combinado. */
    score: real("score").notNull(),
    summary: text("summary"),
    model: text("model").notNull(),
    embedModel: text("embed_model").notNull(),
    weights: jsonb("weights").notNull(),
    /** sha256 del Markdown medido: un informe vale solo para ese contenido exacto del CV. */
    cvHash: text("cv_hash").notNull(),
    /** Niveles por requisito con su evidencia y la cobertura de keywords. */
    report: jsonb("report").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("match_reports_cv_id_idx").on(t.cvId)],
);

/** N postulaciones por vacante: no hay UNIQUE(vacancy_id). `status` está materializado. */
export const applications = pgTable(
  "applications",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    vacancyId: integer("vacancy_id")
      .notNull()
      .references(() => vacancies.id),
    cvId: integer("cv_id").references(() => cvs.id),
    status: applicationStatus("status").notNull().default("applied"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("applications_vacancy_id_idx").on(t.vacancyId)],
);

/** Canales de contacto; uno nuevo es una fila. */
export const channels = pgTable("channels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  profileUrl: text("profile_url"),
  createdAt: createdAt(),
});

/** Contactos de una postulación; `is_process_start` marca el que inició el proceso (C8). */
export const applicationContacts = pgTable(
  "application_contacts",
  {
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
    isProcessStart: boolean("is_process_start").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.applicationId, t.contactId] }),
    uniqueIndex("application_contacts_process_start_uq")
      .on(t.applicationId)
      .where(sql`${t.isProcessStart}`),
  ],
);

/**
 * Eventos de una postulación, append-only: sin `updated_at` y con un trigger que impide
 * UPDATE y DELETE (ver la migración `application_events_append_only`).
 */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id),
    type: applicationEventType("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    channelId: integer("channel_id").references(() => channels.id),
    source: eventSource("source").notNull(),
    contactId: integer("contact_id").references(() => contacts.id),
    notes: text("notes"),
    gmailMessageId: text("gmail_message_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("application_events_application_id_idx").on(t.applicationId, t.occurredAt)],
);

export const outboundEmails = pgTable(
  "outbound_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** `null` mientras es borrador: la postulación nace al enviarlo (#21). */
    applicationId: integer("application_id").references(() => applications.id),
    /** CV desde el que se redactó el borrador (#19). */
    cvId: integer("cv_id").references(() => cvs.id),
    /** `null` si aún no se conoce el destinatario (C7): no se inventa. */
    toAddress: text("to_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    language: text("language").notNull(),
    status: outboundEmailStatus("status").notNull().default("draft"),
    messageIdHeader: text("message_id_header").unique(),
    gmailId: text("gmail_id"),
    threadId: text("thread_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    pdfSha256: text("pdf_sha256"),
    pdf: bytea("pdf"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("outbound_emails_application_id_idx").on(t.applicationId),
    index("outbound_emails_cv_id_idx").on(t.cvId),
    check("outbound_emails_owner", sql`${t.applicationId} IS NOT NULL OR ${t.cvId} IS NOT NULL`),
    check("outbound_emails_pdf_sha256_hex", sql`${t.pdfSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** Estado de sincronización con Gmail. Sin tokens: viven fuera de la base (D10). */
export const gmailSyncState = pgTable("gmail_sync_state", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  account: text("account").notNull().unique(),
  historyId: text("history_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
