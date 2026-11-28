INSERT INTO "platforms" ("slug", "name") VALUES ('manual', 'Manual')
  ON CONFLICT ("slug") DO NOTHING;
