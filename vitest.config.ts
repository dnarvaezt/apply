import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./apps/web/src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: ["apps/api/**/*.test.ts"],
          exclude: ["apps/api/**/*.integration.test.ts"],
          env: { CV_DATA_DIR: path.resolve(import.meta.dirname, "node_modules/.tmp/vitest-data") },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "web",
          environment: "node",
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["packages/db/test/*.test.ts"],
          exclude: ["packages/db/test/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "db-integration",
          environment: "node",
          include: ["packages/db/test/*.integration.test.ts", "apps/api/**/*.integration.test.ts"],
          globalSetup: ["packages/db/test/global-setup.ts"],
          env: { CV_DATA_DIR: path.resolve(import.meta.dirname, "node_modules/.tmp/vitest-data") },
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      // Solo módulos puros (mismo alcance que la mutación, C6); el resto llega con #4/#9.
      include: [
        "apps/api/rag/chunk.ts",
        "apps/api/rag/match.ts",
        "apps/api/match-reports/match.ts",
        "apps/api/match-reports/calibrate.ts",
        "apps/api/storage.ts",
        "apps/api/fetch-url.ts",
        "apps/api/paths.ts",
        "apps/api/ids.ts",
        "apps/api/companies/normalize.ts",
        "apps/api/vacancies/manual-fields.ts",
        "apps/api/vacancies/platform.ts",
        "apps/api/vacancies/posted-at.ts",
        "apps/api/vacancies/relative-date.ts",
        "apps/web/src/features/vacancies/poster-form.ts",
        "apps/web/src/features/applications/pipeline.ts",
        "apps/api/applications/status.ts",
        "apps/api/applications/classified.ts",
        "apps/api/import/legacy.ts",
        "apps/api/import/report.ts",
        "apps/api/emails/draft.ts",
        "apps/api/emails/mime.ts",
        "apps/api/emails/send.ts",
        "apps/api/gmail/*.ts",
        "apps/web/src/lib/api.ts",
        "apps/web/src/lib/api/*.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
