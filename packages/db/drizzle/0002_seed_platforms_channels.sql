INSERT INTO "platforms" ("slug", "name") VALUES ('linkedin', 'LinkedIn')
  ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "channels" ("slug", "name") VALUES
  ('email', 'Email'),
  ('linkedin', 'LinkedIn'),
  ('phone', 'Phone'),
  ('whatsapp', 'WhatsApp'),
  ('ats', 'ATS'),
  ('other', 'Other')
  ON CONFLICT ("slug") DO NOTHING;
