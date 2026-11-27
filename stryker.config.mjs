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
    ? ["apps/api/rag/chunk.ts"]
    : [
        "apps/api/rag/chunk.ts",
        "apps/api/rag/match.ts",
        "apps/api/match-reports/match.ts",
        "apps/api/storage.ts",
        "apps/api/fetch-url.ts",
        "apps/api/llm.ts:167-174",
        "apps/api/vacancies/manual-fields.ts",
        "apps/api/vacancies/platform.ts",
        "apps/api/vacancies/posted-at.ts",
        "apps/api/vacancies/relative-date.ts",
        "apps/web/src/features/vacancies/poster-form.ts",
        "apps/web/src/features/applications/pipeline.ts",
        "apps/api/ids.ts",
        "apps/api/companies/normalize.ts",
        "apps/api/applications/status.ts",
        "apps/api/import/legacy.ts",
        "apps/api/import/report.ts",
        "apps/web/src/lib/api.ts:1-30",
        "apps/web/src/lib/api/http.ts",
        "apps/web/src/lib/api/cvs.ts",
        "apps/web/src/lib/api/vacancies.ts",
        "apps/web/src/lib/api/applications.ts",
        "apps/web/src/lib/api/email-drafts.ts",
        "apps/api/emails/draft.ts",
      ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "html", "json"],
  htmlReporter: { fileName: `${reportDir}/index.html` },
  jsonReporter: { fileName: `${reportDir}/mutation.json` },
  tempDirName: ".stryker-tmp",
  thresholds: { high: 85, low: 70, break: 70 },
};
