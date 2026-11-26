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
    ],
    coverage: {
      provider: "v8",
      // Solo módulos puros (mismo alcance que la mutación, C6); el resto llega con #4/#9.
      include: [
        "apps/api/rag/chunk.ts",
        "apps/api/storage.ts",
        "apps/api/fetch-url.ts",
        "apps/api/paths.ts",
        "apps/web/src/lib/api.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
