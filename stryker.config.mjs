// Único archivo de configuración de Stryker (la mutación se limita a módulos puros, C6).
// Uso: `npm run mutation` (completo, umbral 70%) y `npm run mut:smoke` (canario).
// El canario se elige con la variable MUTATION_SMOKE=1.
const smoke = process.env.MUTATION_SMOKE === "1";
const reportDir = smoke ? "reports/mutation-smoke" : "reports/mutation";

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  // WORKAROUND TS 7: Stryker 10 intenta cargar el `typescript` JS clásico para leer el tsconfig,
  // y TS 7 (compilador nativo) ya no expone esa API. Apuntar `tsconfigFile` a un archivo que no
  // existe evita esa carga sin afectar a Vitest, que transpila con su propio pipeline.
  // Se retira cuando Stryker soporte TS 7; seguimiento en el issue #24 (dnarvaezt/apply).
  tsconfigFile: "tsconfig.stryker-inexistente.json",
  vitest: { configFile: "vitest.config.ts" },
  mutate: smoke
    ? ["packages/api/rag/chunk.ts"]
    : [
        "packages/api/rag/chunk.ts",
        "packages/api/rag/match.ts",
        "packages/api/match-reports/match.ts",
        "packages/api/match-reports/calibrate.ts",
        "packages/api/storage.ts",
        "packages/api/fetch-url.ts",
        "packages/api/llm.ts:163-170",
        "packages/api/claude/cli.ts",
        "packages/api/claude/binary.ts",
        "packages/api/errors.ts",
        "packages/api/health/routes.ts",
        "packages/api/vacancies/manual-fields.ts",
        "packages/api/vacancies/platform.ts",
        "packages/api/vacancies/image.ts",
        "packages/api/vacancies/source.ts",
        "packages/api/vacancies/posted-at.ts",
        "packages/api/vacancies/relative-date.ts",
        "packages/web/src/features/vacancies/poster-form.ts",
        "packages/web/src/features/vacancies/image-file.ts",
        "packages/web/src/features/applications/pipeline.ts",
        "packages/api/ids.ts",
        "packages/api/companies/normalize.ts",
        "packages/api/applications/status.ts",
        "packages/api/applications/classified.ts",
        "packages/api/import/legacy.ts",
        "packages/api/import/report.ts",
        "packages/web/src/lib/api.ts:1-30",
        "packages/web/src/lib/api/http.ts",
        "packages/web/src/lib/api/cvs.ts",
        "packages/web/src/lib/api/vacancies.ts",
        "packages/web/src/lib/api/applications.ts",
        "packages/web/src/lib/api/contacts.ts",
        "packages/web/src/lib/api/metrics.ts",
        "packages/web/src/lib/api/email-drafts.ts",
        "packages/api/emails/draft.ts",
        "packages/api/emails/mime.ts",
        "packages/web/src/lib/api/gmail.ts",
        "packages/api/gmail/config.ts",
        "packages/api/gmail/loopback.ts",
        "packages/api/gmail/token-store.ts",
        "packages/api/gmail/connection.ts",
        "packages/api/gmail/routes.ts",
        "packages/api/gmail/replies.ts",
        "packages/web/src/features/applications/reply-sync-notice.tsx",
      ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "html", "json"],
  htmlReporter: { fileName: `${reportDir}/index.html` },
  jsonReporter: { fileName: `${reportDir}/mutation.json` },
  tempDirName: ".stryker-tmp",
  thresholds: { high: 85, low: 70, break: 70 },
};
