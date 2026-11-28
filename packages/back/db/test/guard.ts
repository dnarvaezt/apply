/** Nombre de la base de desarrollo definida en docker-compose.yml (POSTGRES_DB). */
const DEV_DATABASE = "apply";

/**
 * Aborta antes de conectar si `url` apunta a la base de desarrollo.
 * Se decide por el nombre de la base, no por host o puerto, para cubrir túneles y puertos alternos.
 */
export function assertNotDevDatabase(url: string | undefined): void {
  if (url === undefined || url === "") return;
  let database: string;
  try {
    database = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error(
      "DATABASE_URL no es una URL válida; las pruebas de integración abortan sin conectar.",
    );
  }
  if (database === DEV_DATABASE) {
    throw new Error(
      `DATABASE_URL apunta a la base de desarrollo "${DEV_DATABASE}"; las pruebas de integración abortan sin conectar.`,
    );
  }
}
