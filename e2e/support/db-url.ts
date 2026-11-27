import path from "node:path";

/** Archivo donde `stack.ts` deja la URL del Postgres efímero para los specs que corren comandos. */
export const E2E_DB_URL_FILE = path.resolve(
  import.meta.dirname,
  "../../node_modules/.tmp/e2e-db-url",
);
