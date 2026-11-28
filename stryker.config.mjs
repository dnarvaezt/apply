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
    ? ["packages/back/rag/chunk.ts"]
    : [
        "packages/back/rag/chunk.ts",
        "packages/back/rag/match.ts",
        "packages/back/match-reports/match.ts",
        "packages/back/match-reports/calibrate.ts",
        "packages/back/storage.ts",
        "packages/back/fetch-url.ts",
        "packages/back/llm.ts:163-170",
        "packages/back/claude/cli.ts",
        "packages/back/claude/binary.ts",
        "packages/back/errors.ts",
        "packages/back/health/routes.ts",
        "packages/back/vacancies/manual-fields.ts",
        "packages/back/vacancies/platform.ts",
        "packages/back/vacancies/image.ts",
        "packages/back/vacancies/source.ts",
        "packages/back/vacancies/posted-at.ts",
        "packages/back/vacancies/relative-date.ts",
        "packages/front/src/features/vacancies/poster-form.ts",
        "packages/front/src/features/vacancies/image-file.ts",
        "packages/front/src/features/applications/pipeline.ts",
        "packages/back/ids.ts",
        "packages/back/companies/normalize.ts",
        "packages/back/applications/status.ts",
        "packages/back/applications/classified.ts",
        "packages/back/import/legacy.ts",
        "packages/back/import/report.ts",
        "packages/front/src/lib/api.ts:1-30",
        "packages/front/src/lib/api/http.ts",
        "packages/front/src/lib/api/cvs.ts",
        "packages/front/src/lib/api/vacancies.ts",
        "packages/front/src/lib/api/applications.ts",
        "packages/front/src/lib/api/contacts.ts",
        "packages/front/src/lib/api/metrics.ts",
        "packages/front/src/lib/api/email-drafts.ts",
        "packages/back/emails/draft.ts",
        "packages/back/emails/mime.ts",
        "packages/front/src/lib/api/gmail.ts",
        "packages/back/gmail/config.ts",
        "packages/back/gmail/loopback.ts",
        "packages/back/gmail/token-store.ts",
        "packages/back/gmail/connection.ts",
        "packages/back/gmail/routes.ts",
        "packages/back/gmail/replies.ts",
        "packages/front/src/features/applications/reply-sync-notice.tsx",
      ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "html", "json"],
  htmlReporter: { fileName: `${reportDir}/index.html` },
  jsonReporter: { fileName: `${reportDir}/mutation.json` },
  tempDirName: ".stryker-tmp",
  thresholds: { high: 85, low: 70, break: 70 },
};
