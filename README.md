# Apply

Genera CVs en Markdown alineados a cada vacante usando un RAG local sobre tu información, y los exporta a PDF. Todo corre en local: tu perfil son archivos en `./data`; las vacantes y los CVs se guardan en Postgres (Docker).

**Stack:** TypeScript · React 19 · Vite · Tailwind v4 · shadcn/ui · Biome · Hono (API local) · CLI `claude` · embeddings locales con Transformers.js · Chrome (puppeteer-core) para el PDF.

## Requisitos

- Node 22+ (probado con Node 26)
- Google Chrome o Chromium instalado. Si no está en una ruta estándar, define `CHROME_PATH`.
- La CLI `claude` instalada y con sesión iniciada (suscripción); la API no usa ninguna API key

## Setup

```bash
npm install
cp .env.example .env   # POSTGRES_PASSWORD y DATABASE_URL
npm run db:up && npm run db:migrate   # Postgres de desarrollo (base `apply`)
npm run dev            # API en :3001 y web en http://localhost:5173
```

La primera indexación descarga el modelo de embeddings `Xenova/multilingual-e5-small` (~120 MB) en `.cache/models`. Después todo el RAG funciona sin conexión; solo la extracción de vacantes y la redacción del CV llaman a Claude.

## Flujo

1. **Mi perfil**: completa los archivos Markdown de `data/profile/`. Al primer arranque se crean plantillas. Escribe de más: cada puesto o proyecto bajo su propio `##`, con logros, métricas y tecnologías. Cada sección `##` es un fragmento del RAG.
   - Los archivos que empiezan con `00-` (contacto, resumen base) **siempre** se incluyen.
   - El resto se recupera por similitud con los requisitos de la vacante.
2. **Vacantes**: pega el texto o una URL. Claude extrae el título, la empresa, los requisitos obligatorios y deseables, las responsabilidades, las palabras clave y el idioma. Verás la cobertura estimada de tus requisitos (fuerte / parcial / débil) y la evidencia que encontró en tu perfil.
3. **Generar CV**: Claude redacta el CV en el idioma de la vacante, priorizando lo relevante y usando su vocabulario. **No inventa experiencia**: lo que no está en tu perfil no aparece. El CV se ve mientras se escribe.
4. **CVs**: edita el Markdown con vista previa en vivo y descarga el PDF (A4), el `.md`, o copia el texto.

## Datos

```
data/
  profile/*.md          tu información (fuente del RAG)
```

El índice de embeddings vive en la tabla `profile_chunks` de Postgres (pgvector): se reindexa solo el archivo cuyo contenido cambió, o todo si cambia `EMBED_MODEL`. Un `data/index.json` de versiones anteriores ya no se usa y puede borrarse.

Las vacantes (con su empresa normalizada en `companies`) y los CVs viven en Postgres, no en `data/`; la API lee `DATABASE_URL`. El PDF de un CV no se guarda: se regenera en cada descarga. Si tienes vacantes y CVs de la versión en archivos (`data/vacancies/*.json`, `data/cvs/*.json` + `*.md`), `npm run db:import` los pasa a Postgres. `data/` está en `.gitignore`: tu información no se versiona.

## Variables de entorno

| Variable       | Default                        | Uso                            |
| -------------- | ------------------------------ | ------------------------------ |
| `CLAUDE_MODEL` | `claude-opus-5-5`              | Modelo para extraer y redactar |
| `DATABASE_URL` | —                              | Postgres de la API (requerida) |
| `EMBED_MODEL`  | `Xenova/multilingual-e5-small` | Modelo de embeddings local     |
| `CHROME_PATH`  | autodetección                  | Ejecutable de Chrome/Chromium  |
| `PORT`         | `3001`                         | Puerto de la API               |

## Base de datos

Postgres 18 con pgvector (`pgvector/pgvector:0.8.7-pg18`) en Docker Compose; la app sigue corriendo en el host.

```bash
cp .env.example .env   # cambia POSTGRES_PASSWORD (y DATABASE_URL en consecuencia)
npm run db:up          # levanta el servicio db y espera a que esté healthy
npm run db:down        # lo detiene; el volumen `pgdata` conserva los datos
```

- El puerto se publica solo en `127.0.0.1:${PG_PORT:-5432}`.
- Sin `POSTGRES_PASSWORD`, `docker compose` falla y nombra la variable.
- Para aislar contenedor y volumen por worktree define `COMPOSE_PROJECT_NAME` y `PG_PORT` distintos.
- `docker compose down -v` borra el volumen y los datos.

## Scripts

Atajos con `make` (`make help` los lista): `make env` crea `.env` desde `.env.example` sin pisar uno existente; `make start` levanta Postgres, migra y arranca API + web en segundo plano (PID en `.run/dev.pid`, salida en `.run/dev.log`); `make logs`, `make status`, `make stop`, `make restart`, `make down` (app y Postgres); `make db-logs`, `make db-reset` (borra la base, pide confirmación); `make check` (lint + typecheck + tests), `make test`, `make e2e`, `make mutation`; `make clean` borra reportes y temporales sin tocar `data/`, `.env`, los modelos ni la base.

- `npm run dev`: API (:3001) y web con recarga (workspaces `@apply/back` y `@apply/front`)
- `npm run build`: typecheck y build del frontend
- `npm run typecheck`: `tsc -b` sobre los tres workspaces
- `npm run db:up` / `npm run db:down`: levanta o detiene Postgres + pgvector (Docker Compose)
- `npm run db:generate`: `drizzle-kit generate` en `packages/back` (config `drizzle.config.ts`, salida en `db/drizzle/`) (no necesita Postgres)
- `npm run db:migrate`: aplica las migraciones versionadas de `packages/back/db/drizzle/` (extensión `vector`, 13 tablas, semilla de `platforms` y `channels`) sobre la base de `DATABASE_URL`; es idempotente
- `npm run db:import`: importa a Postgres las vacantes y los CVs de `data/` (conserva su id viejo en `legacy_id`, sus fechas y la relación CV → vacante) y reconstruye el índice del perfil. Es idempotente: lo ya importado se cuenta como omitido. No modifica ni borra archivos de `data/`. Imprime los conteos y sale con código 1 si algún archivo no se pudo importar
- `npm run match:calibrate [carpeta]`: mide los umbrales del match del CV (`fuerte`/`parcial`) contra pares CV-vacante etiquetados a mano y propone los que más aciertan, con la tabla de aciertos antes y después. Lee `data/match-sample/*.json` por defecto (fuera de git: son CVs reales). Cada archivo: `{ "cv": "<Markdown>", "vacancy": { "mustHave": [...], "niceToHave": [...], "keywords": [...] }, "expected": [{ "requirement": "<texto exacto de mustHave o niceToHave>", "level": "fuerte" | "parcial" | "débil" }] }`. No cambia nada: los umbrales se editan en `packages/back/rag/match.ts`
- `npm run lint`: Biome
- `npm run format`: Biome con `--write`
- `npm test`: Vitest (proyectos `api`, `web`, `db` y `db-integration`; los de integración levantan Postgres efímero con Docker)
- `npm run coverage`: cobertura v8, falla bajo 80% de líneas o ramas
- `npm run mutation`: Stryker sobre módulos puros, falla bajo 70%
- `npm run mut:smoke`: canario de mutación sobre `packages/back/rag/chunk.ts`
- `npm run claude:smoke`: smoke manual opt-in contra el `claude` real (fuera de `npm test` y del e2e); sale con exit 1 si `apiKeySource` no es `none` o falta `structured_output`. La extracción de la vacante, el correo y el CV (en streaming; se cancela si el cliente se desconecta) usan `claude -p` local: `CLAUDE_BIN` (default `claude`), `CLAUDE_MODEL` (default `claude-opus-5-5`) y `CLAUDE_TIMEOUT_MS` (default `600000`); el hijo no recibe ninguna `ANTHROPIC_*`.
- `npm run e2e`: Playwright con la web y la API reales sobre un Postgres efímero (Testcontainers, con migraciones; nunca la base `apply`), `claude` falso para la vacante, el correo y el CV en streaming (`packages/back/test/fake-claude.mjs`, vía `CLAUDE_BIN`) y un directorio de datos temporal. Necesita Docker; usa Chrome del host o `npx playwright install chromium`. Puertos por entorno para correr dos worktrees a la vez: `E2E_API_PORT` (3101), `E2E_WEB_PORT` (5174); Google falso usa `E2E_API_PORT + 2000`. Ej.: `E2E_API_PORT=3201 E2E_WEB_PORT=5274 npm run e2e`

## Estructura

```
packages/back/    @apply/back: API Hono; index.ts monta las rutas; por entidad: vacancies/ y cvs/ (routes + repository), companies/; db.ts (cliente), storage.ts, rag/, llm.ts, pdf.ts, fetch-url.ts
packages/back/db/ esquema Drizzle (13 tablas), migraciones versionadas en `drizzle/`, `migrate.ts` y cliente (config en `packages/back/drizzle.config.ts`); se importa como `#db` (subpath import de @apply/back)
packages/front/   @apply/front: Vite + React + shadcn; src/features: profile, vacancies, cvs
packages/shared/  @apply/shared: tipos por entidad (vacancy.ts, cv.ts, types.ts) reexportados desde index.ts, y el CSS del CV (el mismo para la vista previa y el PDF)
```

Monorrepo con npm workspaces (`packages/*`) y un único `package-lock.json`. `data/`, `.cache/models` y `.env` se resuelven siempre en la raíz del repo (`packages/back/paths.ts`), sin importar el cwd.
