ALTER TABLE "outbound_emails" ALTER COLUMN "application_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_emails" ALTER COLUMN "to_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD COLUMN "cv_id" integer;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_cv_id_cvs_id_fk" FOREIGN KEY ("cv_id") REFERENCES "public"."cvs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_emails_cv_id_idx" ON "outbound_emails" USING btree ("cv_id");--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_owner" CHECK ("outbound_emails"."application_id" IS NOT NULL OR "outbound_emails"."cv_id" IS NOT NULL);