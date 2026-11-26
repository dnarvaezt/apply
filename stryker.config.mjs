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
    ? ["server/rag/chunk.ts"]
    : [
        "server/rag/chunk.ts",
        "server/storage.ts",
        "server/fetch-url.ts",
        "server/llm.ts:144-151",
        "src/lib/api.ts:1-108",
      ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "html", "json"],
  htmlReporter: { fileName: `${reportDir}/index.html` },
  jsonReporter: { fileName: `${reportDir}/mutation.json` },
  tempDirName: ".stryker-tmp",
  thresholds: { high: 85, low: 70, break: 70 },
};
