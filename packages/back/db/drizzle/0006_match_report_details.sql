ALTER TABLE "match_reports" ADD COLUMN "cv_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "match_reports" ADD COLUMN "report" jsonb NOT NULL;