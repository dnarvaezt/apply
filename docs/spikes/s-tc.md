# S-TC: Postgres efímero con pgvector para pruebas

Fecha: 2026-11-26. Issue: #9.

## Veredicto

**Testcontainers: PASA** en este host (Docker 29.10.1, Compose 5.8.0, kernel 7.3.6, usuario en el grupo `docker`).

**Arnés elegido:** `@testcontainers/postgresql` 12.2.2 con la imagen `pgvector/pgvector:0.8.7-pg18`.
La caída C3 (compose de test con proyecto y puerto propios) **no se aplicó** porque Testcontainers funciona. Si en otro host falla por entorno (sin módulo `veth`, o sin grupo `docker`), eso es un bloqueo de entorno, no un fallo de código; la caída sería un `docker-compose.test.yml` con `COMPOSE_PROJECT_NAME` y `PG_PORT` propios y la base `apply_test`, sin tocar `docker-compose.yml`.

## Cómo funciona

- Proyecto vitest `db-integration` (`vitest.config.ts`) con `globalSetup` en `packages/db/test/global-setup.ts`: arranca un contenedor con la base dedicada `apply_test` (nunca `postgres` ni `apply`) y entrega la URL a las pruebas con `project.provide("testDatabaseUrl")`. El `teardown` lo detiene.
- `npm test` ejecuta todo, sin pasos manuales. Docker debe estar disponible.
- Prueba `packages/db/test/vector.integration.test.ts`: `CREATE EXTENSION vector`, inserta vectores y ordena por `cosineDistance` de Drizzle.
- Guard `packages/db/test/guard.ts`: si `DATABASE_URL` apunta a una base llamada `apply` (la de `docker-compose.yml`), el setup aborta con un error explícito antes de levantar nada ni conectar. Se decide por nombre de base, no por host o puerto.

## Evidencia

- Aislamiento (AC-005): con una base de desarrollo levantada aparte (compose con proyecto `apply-spike9-dev`, puerto 55439), la suite no cambió sus bases (`apply,postgres`) ni su conteo de tablas (0 antes, 0 después). El contenedor de prueba usa su propio puerto aleatorio.
- Limpieza (AC-004): tras la suite, `docker ps` queda vacío; el contenedor auxiliar `ryuk` de Testcontainers se autodestruye unos segundos después.

## Límites y riesgos

- Arrancar el contenedor añade unos 5 a 10 s a `npm test` (más la primera descarga de la imagen).
- Snapshot/restore de Testcontainers (D9) requiere una base distinta de `postgres`; `apply_test` lo cumple, pero aún no se usa porque la prueba actual limpia su propia tabla. Se adoptará cuando #10 aporte el esquema real.
