ALTER TABLE "contacts" ADD COLUMN "notes" text;--> statement-breakpoint
UPDATE "channels" SET "name" = 'Correo' WHERE "slug" = 'email';--> statement-breakpoint
UPDATE "channels" SET "name" = 'Teléfono' WHERE "slug" = 'phone';--> statement-breakpoint
UPDATE "channels" SET "name" = 'Otro' WHERE "slug" = 'other';
