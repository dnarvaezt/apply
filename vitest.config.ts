import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./packages/web/src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: ["packages/api/**/*.test.ts"],
          exclude: ["packages/api/**/*.integration.test.ts"],
          env: { CV_DATA_DIR: path.resolve(import.meta.dirname, "node_modules/.tmp/vitest-data") },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "web",
          environment: "node",
          include: ["packages/web/src/**/*.test.{ts,tsx}"],
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
          include: [
            "packages/db/test/*.integration.test.ts",
            "packages/api/**/*.integration.test.ts",
          ],
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
        "packages/api/rag/chunk.ts",
        "packages/api/rag/match.ts",
        "packages/api/match-reports/match.ts",
        "packages/api/match-reports/calibrate.ts",
        "packages/api/storage.ts",
        "packages/api/fetch-url.ts",
        "packages/api/claude/cli.ts",
        "packages/api/claude/binary.ts",
        "packages/api/errors.ts",
        "packages/api/health/routes.ts",
        "packages/api/paths.ts",
        "packages/api/ids.ts",
        "packages/api/companies/normalize.ts",
        "packages/api/vacancies/manual-fields.ts",
        "packages/api/vacancies/platform.ts",
        "packages/api/vacancies/posted-at.ts",
        "packages/api/vacancies/relative-date.ts",
        "packages/web/src/features/vacancies/poster-form.ts",
        "packages/web/src/features/applications/pipeline.ts",
        "packages/api/applications/status.ts",
        "packages/api/applications/classified.ts",
        "packages/api/import/legacy.ts",
        "packages/api/import/report.ts",
        "packages/api/emails/draft.ts",
        "packages/api/emails/mime.ts",
        "packages/api/emails/send.ts",
        "packages/api/gmail/*.ts",
        "packages/web/src/lib/api.ts",
        "packages/web/src/lib/api/*.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
