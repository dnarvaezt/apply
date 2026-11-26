import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: ["server/**/*.test.ts"],
          env: { CV_DATA_DIR: path.resolve(import.meta.dirname, "node_modules/.tmp/vitest-data") },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "web",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      // Solo módulos puros (mismo alcance que la mutación, C6); el resto llega con #4/#9.
      include: [
        "server/rag/chunk.ts",
        "server/storage.ts",
        "server/fetch-url.ts",
        "src/lib/api.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      thresholds: { lines: 80, branches: 80 },
    },
  },
});
