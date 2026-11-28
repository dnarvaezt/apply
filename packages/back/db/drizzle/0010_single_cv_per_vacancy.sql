-- Un único CV por vacante (#76): se queda el más reciente; las postulaciones y los correos
-- ligados a los demás pasan a él, y sus informes de match (medían otro Markdown) se borran.
WITH ranked AS (
  SELECT id, first_value(id) OVER (PARTITION BY vacancy_id ORDER BY created_at DESC, id DESC) AS keeper
  FROM cvs WHERE vacancy_id IS NOT NULL
)
UPDATE "applications" a SET cv_id = r.keeper FROM ranked r WHERE a.cv_id = r.id AND r.id <> r.keeper;--> statement-breakpoint
WITH ranked AS (
  SELECT id, first_value(id) OVER (PARTITION BY vacancy_id ORDER BY created_at DESC, id DESC) AS keeper
  FROM cvs WHERE vacancy_id IS NOT NULL
)
UPDATE "outbound_emails" o SET cv_id = r.keeper FROM ranked r WHERE o.cv_id = r.id AND r.id <> r.keeper;--> statement-breakpoint
WITH ranked AS (
  SELECT id, first_value(id) OVER (PARTITION BY vacancy_id ORDER BY created_at DESC, id DESC) AS keeper
  FROM cvs WHERE vacancy_id IS NOT NULL
)
DELETE FROM "match_reports" WHERE cv_id IN (SELECT id FROM ranked WHERE id <> keeper);--> statement-breakpoint
WITH ranked AS (
  SELECT id, first_value(id) OVER (PARTITION BY vacancy_id ORDER BY created_at DESC, id DESC) AS keeper
  FROM cvs WHERE vacancy_id IS NOT NULL
)
DELETE FROM "cvs" WHERE id IN (SELECT id FROM ranked WHERE id <> keeper);--> statement-breakpoint
DROP INDEX "cvs_vacancy_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "cvs_vacancy_id_uq" ON "cvs" USING btree ("vacancy_id");