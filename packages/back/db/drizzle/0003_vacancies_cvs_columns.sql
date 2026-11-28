ALTER TABLE "cvs" ALTER COLUMN "vacancy_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "normalized_name" text;--> statement-breakpoint
ALTER TABLE "cvs" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cvs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "seniority" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "language" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "summary" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "must_have" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "nice_to_have" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_normalized_name_unique" UNIQUE("normalized_name");