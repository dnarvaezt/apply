# Apply

Genera CVs en Markdown alineados a cada vacante usando un RAG local sobre tu información, y los exporta a PDF. Todo corre en local: tu perfil son archivos en `./data`; las vacantes y los CVs se guardan en Postgres (Docker).

**Stack:** TypeScript · React 19 · Vite · Tailwind v4 · shadcn/ui · Biome · Hono (API local) · Claude API · embeddings locales con Transformers.js · Chrome (puppeteer-core) para el PDF.

## Requisitos

- Node 22+ (probado con Node 26)
- Google Chrome o Chromium instalado. Si no está en una ruta estándar, define `CHROME_PATH`.
- Una API key de Anthropic

## Setup

```bash
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, POSTGRES_PASSWORD y DATABASE_URL
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

Las vacantes (con su empresa normalizada en `companies`) y los CVs viven en Postgres, no en `data/`; la API lee `DATABASE_URL`. El PDF de un CV no se guarda: se regenera en cada descarga. `data/` está en `.gitignore`: tu información no se versiona.

## Variables de entorno

| Variable            | Default                        | Uso                            |
| ------------------- | ------------------------------ | ------------------------------ |
| `ANTHROPIC_API_KEY` | —                              | Requerida                      |
| `CLAUDE_MODEL`      | `claude-opus-5-5`              | Modelo para extraer y redactar |
| `DATABASE_URL`      | —                              | Postgres de la API (requerida) |
| `EMBED_MODEL`       | `Xenova/multilingual-e5-small` | Modelo de embeddings local     |
| `CHROME_PATH`       | autodetección                  | Ejecutable de Chrome/Chromium  |
| `PORT`              | `3001`                         | Puerto de la API               |

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

- `npm run dev`: API (:3001) y web con recarga (workspaces `@apply/api` y `@apply/web`)
- `npm run build`: typecheck y build del frontend
- `npm run typecheck`: `tsc -b` sobre los cuatro workspaces
- `npm run db:up` / `npm run db:down`: levanta o detiene Postgres + pgvector (Docker Compose)
- `npm run db:generate`: `drizzle-kit generate` en `packages/db` (no necesita Postgres)
- `npm run db:migrate`: aplica las migraciones versionadas de `packages/db/drizzle/` (extensión `vector`, 13 tablas, semilla de `platforms` y `channels`) sobre la base de `DATABASE_URL`; es idempotente
- `npm run lint`: Biome
- `npm run format`: Biome con `--write`
- `npm test`: Vitest (proyectos `api`, `web`, `db` y `db-integration`; los de integración levantan Postgres efímero con Docker)
- `npm run coverage`: cobertura v8, falla bajo 80% de líneas o ramas
- `npm run mutation`: Stryker sobre módulos puros, falla bajo 70%
- `npm run mut:smoke`: canario de mutación sobre `apps/api/rag/chunk.ts`
- `npm run e2e`: Playwright con la web y la API reales sobre un Postgres efímero (Testcontainers, con migraciones; nunca la base `apply`), Anthropic falso en la frontera HTTP (`e2e/support/fake-anthropic.ts`, vía `ANTHROPIC_BASE_URL`) y un directorio de datos temporal. Necesita Docker; usa Chrome del host o `npx playwright install chromium`. Puertos por entorno para correr dos worktrees a la vez: `E2E_API_PORT` (3101), `E2E_WEB_PORT` (5174); el Anthropic falso usa `E2E_API_PORT + 1000`. Ej.: `E2E_API_PORT=3201 E2E_WEB_PORT=5274 npm run e2e`

## Estructura

```
apps/api/        API Hono (@apply/api): index.ts monta las rutas; por entidad: vacancies/ y cvs/ (routes + repository), companies/; db.ts (cliente), storage.ts, rag/, llm.ts, pdf.ts, fetch-url.ts
apps/web/        Vite + React + shadcn (@apply/web); src/features: profile, vacancies, cvs
packages/shared/ @apply/shared: tipos por entidad (vacancy.ts, cv.ts, types.ts) reexportados desde index.ts, y el CSS del CV (el mismo para la vista previa y el PDF)
packages/db/     @apply/db: esquema Drizzle (13 tablas), migraciones versionadas en `drizzle/`, `migrate.ts`, drizzle.config.ts y cliente
```

Monorrepo con npm workspaces (`apps/*`, `packages/*`) y un único `package-lock.json`. `data/`, `.cache/models` y `.env` se resuelven siempre en la raíz del repo (`apps/api/paths.ts`), sin importar el cwd.
