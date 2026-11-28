ALTER TYPE "public"."application_event_type" ADD VALUE 'assessment' BEFORE 'offer';--> statement-breakpoint
ALTER TYPE "public"."application_event_type" ADD VALUE 'note';--> statement-breakpoint
ALTER TYPE "public"."application_event_type" ADD VALUE 'follow_up';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'assessment' BEFORE 'offer';