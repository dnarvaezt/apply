import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { E2E_DB_URL_FILE } from "./support/db-url.ts";
import { openDetailTab } from "./support/vacancy-ui.ts";

const run = promisify(execFile);
const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const ROOT = path.resolve(import.meta.dirname, "..");

const FIXTURE: Record<string, string> = {
  "vacancies/2026-05-01-globex-sre-aaaaaa.json": JSON.stringify({
    id: "2026-05-01-globex-sre-aaaaaa",
    createdAt: "2026-05-01T10:00:00.000Z",
    sourceUrl: null,
    rawText: "SRE con Kubernetes.",
    title: "SRE Importada E2E",
    company: "Globex",
    location: null,
    seniority: null,
    language: "es",
    summary: "Operar la plataforma.",
    mustHave: ["Kubernetes"],
    niceToHave: [],
    responsibilities: [],
    keywords: [],
  }),
  "cvs/2026-05-02-globex-bbbbbb.json": JSON.stringify({
    id: "2026-05-02-globex-bbbbbb",
    vacancyId: "2026-05-01-globex-sre-aaaaaa",
    title: "CV Importado E2E",
    createdAt: "2026-05-02T09:00:00.000Z",
    updatedAt: "2026-05-02T09:00:00.000Z",
  }),
  "cvs/2026-05-02-globex-bbbbbb.md": "# Ana Pérez\n\nSRE con Kubernetes.\n",
  "profile/10-experiencia.md": "# Experiencia\n\n## SRE en Globex\n\nKubernetes en producción.\n",
};

test("AC-006: tras importar data/ la web lista la vacante y el CV importados", async ({
  page,
  request,
}) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "apply-e2e-import-"));
  try {
    for (const [name, content] of Object.entries(FIXTURE)) {
      await mkdir(path.dirname(path.join(dataDir, name)), { recursive: true });
      await writeFile(path.join(dataDir, name), content, "utf8");
    }
    const { stdout } = await run("npm", ["run", "--silent", "db:import"], {
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_URL: await readFile(E2E_DB_URL_FILE, "utf8"),
        CV_DATA_DIR: dataDir,
      },
    });
    expect(stdout).toContain("Vacantes: 1 importadas, 0 omitidas");
    expect(stdout).toContain("CVs: 1 importados, 0 omitidos");

    await page.goto("/");
    await page.getByRole("link", { name: /SRE Importada E2E/ }).click();
    await openDetailTab(page, "CV");
    await expect(page.getByLabel("Título del CV")).toHaveValue("CV Importado E2E");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    // Deja la base como la encontró: borra lo importado por la API pública.
    const cvs = (await (await request.get(`${API}/api/cvs`)).json()) as {
      id: string;
      title: string;
    }[];
    for (const cv of cvs.filter((c) => c.title === "CV Importado E2E")) {
      await request.delete(`${API}/api/cvs/${cv.id}`);
    }
    const vacancies = (await (await request.get(`${API}/api/vacancies`)).json()) as {
      id: string;
      title: string;
    }[];
    for (const v of vacancies.filter((x) => x.title === "SRE Importada E2E")) {
      await request.delete(`${API}/api/vacancies/${v.id}`);
    }
  }
});
