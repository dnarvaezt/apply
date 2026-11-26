# Apply

Genera CVs en Markdown alineados a cada vacante usando un RAG local sobre tu información, y los exporta a PDF. Todo corre en local, sin base de datos: los datos son archivos en `./data`.

**Stack:** TypeScript · React 19 · Vite · Tailwind v4 · shadcn/ui · Biome · Hono (API local) · Claude API · embeddings locales con Transformers.js · Chrome (puppeteer-core) para el PDF.

## Requisitos

- Node 22+ (probado con Node 26)
- Google Chrome o Chromium instalado. Si no está en una ruta estándar, define `CHROME_PATH`.
- Una API key de Anthropic

## Setup

```bash
npm install
cp .env.example .env   # y pon tu ANTHROPIC_API_KEY
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
  index.json            índice de embeddings (se regenera solo si cambian los archivos)
  vacancies/<id>.json   vacantes analizadas
  cvs/<id>.md|.json|.pdf  CVs generados, metadatos y último PDF
```

`data/` está en `.gitignore`: tu información no se versiona.

## Variables de entorno

| Variable            | Default                        | Uso                            |
| ------------------- | ------------------------------ | ------------------------------ |
| `ANTHROPIC_API_KEY` | —                              | Requerida                      |
| `CLAUDE_MODEL`      | `claude-opus-5-5`              | Modelo para extraer y redactar |
| `EMBED_MODEL`       | `Xenova/multilingual-e5-small` | Modelo de embeddings local     |
| `CHROME_PATH`       | autodetección                  | Ejecutable de Chrome/Chromium  |
| `PORT`              | `3001`                         | Puerto de la API               |

## Scripts

- `npm run dev`: API (:3001) y web con recarga (workspaces `@apply/api` y `@apply/web`)
- `npm run build`: typecheck y build del frontend
- `npm run typecheck`: `tsc -b` sobre los cuatro workspaces
- `npm run db:generate`: `drizzle-kit generate` en `packages/db` (no necesita Postgres)
- `npm run lint`: Biome
- `npm run format`: Biome con `--write`
- `npm test`: Vitest (proyectos `api` y `web`)
- `npm run coverage`: cobertura v8, falla bajo 80% de líneas o ramas
- `npm run mutation`: Stryker sobre módulos puros, falla bajo 70%
- `npm run mut:smoke`: canario de mutación sobre `apps/api/rag/chunk.ts`
- `npm run e2e`: Playwright con API y web levantadas y un directorio de datos temporal (usa Chrome del host o `npx playwright install chromium`)

## Estructura

```
apps/api/        API Hono (@apply/api): storage, rag/ (chunk, embed, index), llm.ts, pdf.ts, fetch-url.ts
apps/web/        Vite + React + shadcn (@apply/web); src/features: profile, vacancies, cvs
packages/shared/ @apply/shared: tipos y el CSS del CV (el mismo para la vista previa y el PDF)
packages/db/     @apply/db: esquema Drizzle mínimo, drizzle.config.ts y cliente (el modelo real llega con #10)
```

Monorrepo con npm workspaces (`apps/*`, `packages/*`) y un único `package-lock.json`. `data/`, `.cache/models` y `.env` se resuelven siempre en la raíz del repo (`apps/api/paths.ts`), sin importar el cwd.
