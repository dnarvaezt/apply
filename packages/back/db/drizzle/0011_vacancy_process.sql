CREATE TYPE "public"."discard_reason" AS ENUM('rejected', 'withdrawn', 'closed');--> statement-breakpoint
CREATE TYPE "public"."vacancy_status" AS ENUM('to_apply', 'applied', 'contacted', 'interview', 'assessment', 'offer', 'hired', 'discarded');--> statement-breakpoint
CREATE TABLE "vacancy_contacts" (
	"vacancy_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"is_process_start" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancy_contacts_vacancy_id_contact_id_pk" PRIMARY KEY("vacancy_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "vacancy_status_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vacancy_status_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"vacancy_id" integer NOT NULL,
	"from_status" "vacancy_status",
	"to_status" "vacancy_status" NOT NULL,
	"discard_reason" "discard_reason",
	"note" text,
	"channel_id" integer,
	"source" "event_source" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancy_status_changes_discard_reason" CHECK (("vacancy_status_changes"."to_status" = 'discarded') = ("vacancy_status_changes"."discard_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "status" "vacancy_status" DEFAULT 'to_apply' NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "discard_reason" "discard_reason";--> statement-breakpoint
ALTER TABLE "vacancy_contacts" ADD CONSTRAINT "vacancy_contacts_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_contacts" ADD CONSTRAINT "vacancy_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_status_changes" ADD CONSTRAINT "vacancy_status_changes_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_status_changes" ADD CONSTRAINT "vacancy_status_changes_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vacancy_contacts_process_start_uq" ON "vacancy_contacts" USING btree ("vacancy_id") WHERE "vacancy_contacts"."is_process_start";--> statement-breakpoint
CREATE INDEX "vacancy_status_changes_vacancy_id_idx" ON "vacancy_status_changes" USING btree ("vacancy_id","occurred_at");--> statement-breakpoint
CREATE INDEX "vacancies_status_idx" ON "vacancies" USING btree ("status");--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_discard_reason" CHECK (("vacancies"."status" = 'discarded') = ("vacancies"."discard_reason" IS NOT NULL));--> statement-breakpoint
-- Datos (#80): el estado de la vacante sale de su postulación más reciente; los estados
-- terminales viejos pasan a Contratada o Descartada con su motivo.
WITH latest AS (
  SELECT DISTINCT ON (vacancy_id) vacancy_id, status::text AS status
  FROM "applications" ORDER BY vacancy_id, updated_at DESC, id DESC
)
UPDATE "vacancies" v SET
  status = (CASE l.status
    WHEN 'offer_accepted' THEN 'hired'
    WHEN 'offer_declined' THEN 'discarded'
    WHEN 'rejected' THEN 'discarded'
    WHEN 'withdrawn' THEN 'discarded'
    WHEN 'closed' THEN 'discarded'
    ELSE l.status END)::vacancy_status,
  discard_reason = (CASE l.status
    WHEN 'offer_declined' THEN 'withdrawn'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'withdrawn' THEN 'withdrawn'
    WHEN 'closed' THEN 'closed' END)::discard_reason
FROM latest l WHERE v.id = l.vacancy_id;--> statement-breakpoint
-- El historial empieza con el estado traído de la postulación; los eventos viejos siguen en
-- `application_events`.
INSERT INTO "vacancy_status_changes" (vacancy_id, from_status, to_status, discard_reason, note, source, occurred_at)
SELECT v.id, NULL, v.status, v.discard_reason, 'Estado traído de la postulación', 'auto',
  (SELECT max(a.updated_at) FROM "applications" a WHERE a.vacancy_id = v.id)
FROM "vacancies" v WHERE EXISTS (SELECT 1 FROM "applications" a WHERE a.vacancy_id = v.id);--> statement-breakpoint
-- Los contactos pasan de la postulación a su vacante; solo uno sigue como inicio del proceso.
INSERT INTO "vacancy_contacts" (vacancy_id, contact_id, is_process_start, created_at)
SELECT vacancy_id, contact_id, is_process_start AND starter_rank = 1, created_at FROM (
  SELECT DISTINCT ON (a.vacancy_id, ac.contact_id) a.vacancy_id, ac.contact_id, ac.is_process_start, ac.created_at,
    row_number() OVER (PARTITION BY a.vacancy_id, ac.is_process_start ORDER BY ac.created_at, ac.contact_id) AS starter_rank
  FROM "application_contacts" ac JOIN "applications" a ON a.id = ac.application_id
  ORDER BY a.vacancy_id, ac.contact_id, ac.is_process_start DESC, ac.created_at
) c;
