ALTER TABLE "cvs" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "legacy_id" text;--> statement-breakpoint
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_legacy_id_unique" UNIQUE("legacy_id");--> statement-breakpoint
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_legacy_id_unique" UNIQUE("legacy_id");