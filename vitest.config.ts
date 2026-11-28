import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./packages/front/src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: ["packages/back/**/*.test.ts"],
          exclude: ["packages/back/**/*.integration.test.ts", "packages/back/db/**"],
          env: { CV_DATA_DIR: path.resolve(import.meta.dirname, "node_modules/.tmp/vitest-data") },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "web",
          environment: "node",
          include: ["packages/front/src/**/*.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["packages/back/db/test/*.test.ts"],
          exclude: ["packages/back/db/test/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "db-integration",
          environment: "node",
          include: [
            "packages/back/db/test/*.integration.test.ts",
            "packages/back/**/*.integration.test.ts",
          ],
          globalSetup: ["packages/back/db/test/global-setup.ts"],
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
        "packages/back/rag/chunk.ts",
        "packages/back/rag/match.ts",
        "packages/back/match-reports/match.ts",
        "packages/back/match-reports/calibrate.ts",
        "packages/back/storage.ts",
        "packages/back/fetch-url.ts",
        "packages/back/claude/cli.ts",
        "packages/back/claude/binary.ts",
        "packages/back/errors.ts",
        "packages/back/health/routes.ts",
        "packages/back/paths.ts",
        "packages/back/ids.ts",
        "packages/back/companies/normalize.ts",
        "packages/back/vacancies/manual-fields.ts",
        "packages/back/vacancies/platform.ts",
        "packages/back/vacancies/posted-at.ts",
        "packages/back/vacancies/relative-date.ts",
        "packages/front/src/features/vacancies/poster-form.ts",
        "packages/front/src/features/applications/pipeline.ts",
        "packages/back/applications/status.ts",
        "packages/back/applications/classified.ts",
        "packages/back/import/legacy.ts",
        "packages/back/import/report.ts",
        "packages/back/emails/draft.ts",
        "packages/back/emails/mime.ts",
        "packages/back/emails/send.ts",
        "packages/back/gmail/*.ts",
        "packages/front/src/lib/api.ts",
        "packages/front/src/lib/api/*.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
