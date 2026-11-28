import { readdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openDetailTab } from "./support/vacancy-ui.ts";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const DATA_DIR = path.resolve(import.meta.dirname, "../node_modules/.tmp/e2e-data");

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

async function filesIn(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

test("AC-006: crear vacante, generar CV, editarlo, descargar el PDF y borrar ambos (Postgres + claude falso)", async ({
  page,
  request,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());

  // Crear una vacante pegando texto
  await page.goto("/vacancies");
  await page.getByRole("link", { name: "Nueva vacante" }).first().click();
  await page
    .getByPlaceholder("Pega aquí la descripción completa de la vacante…")
    .fill(VACANCY_TEXT);
  await page.getByRole("button", { name: "Analizar vacante" }).click();
  await expect(page.getByText("Vacante analizada: Ingeniera Backend E2E")).toBeVisible();
  await expect(page).toHaveURL(/\/vacancies\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Ingeniera Backend E2E" })).toBeVisible();

  // Generar un CV en su tab
  await openDetailTab(page, "CV");
  await expect(page).toHaveURL(/[?&]tab=cv/);
  await page.getByRole("button", { name: /Generar CV para esta vacante/ }).click();
  // La primera vez el RAG descarga el modelo de embeddings (~120 MB).
  await expect(page.getByText("CV generado y guardado")).toBeVisible({ timeout: 180_000 });

  // Editarlo: título y markdown, y comprobar que persiste tras recargar
  const title = page.getByLabel("Título del CV");
  await expect(title).toHaveValue("Ingeniera Backend E2E — ACME S.A.");
  // Abre en "Vista previa" (render) y se alterna a "Editar" solo con el teclado.
  await expect(page.getByRole("tab", { name: "Vista previa" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("textarea.font-mono")).toHaveCount(0);
  await page.getByRole("tab", { name: "Vista previa" }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Editar" })).toHaveAttribute("aria-selected", "true");
  const editor = page.locator("textarea.font-mono");
  await expect(editor).toHaveValue(/# Ana Pérez/);
  const marker = `Editado e2e ${Date.now()}`;
  await editor.fill(`# Ana Pérez\n\n**Ingeniera Backend**\n\n${marker}\n`);
  await title.fill("CV editado e2e");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();

  // La URL fija el tab y el CV abierto: recargar vuelve al mismo.
  await expect(page).toHaveURL(/[?&]cv=/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "CV", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Título del CV")).toHaveValue("CV editado e2e");
  await page.getByRole("tab", { name: "Editar" }).click();
  await expect(page.locator("textarea.font-mono")).toHaveValue(new RegExp(marker));
  await page.getByRole("tab", { name: "Vista previa" }).click();
  await expect(page.getByText(marker)).toBeVisible();

  // Descargar el PDF (se regenera en la descarga) y comprobar que no queda en disco
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^CV-ana-perez-.+\.pdf$/);
  const pdfPath = await download.path();
  const { readFile } = await import("node:fs/promises");
  expect((await readFile(pdfPath)).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // Borrar el CV y la vacante
  await page.getByRole("button", { name: "Eliminar CV" }).click();
  await expect(page.getByText("Aún no hay un CV para esta vacante")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page).toHaveURL(/\/vacancies$/);
  await expect(page.getByText("Aún no hay vacantes")).toBeVisible();

  // La API no conserva nada y `data/vacancies` y `data/cvs` nunca recibieron archivos (REQ-001)
  expect(await (await request.get(`${API}/api/vacancies`)).json()).toEqual([]);
  expect(await (await request.get(`${API}/api/cvs`)).json()).toEqual([]);
  expect(await filesIn(path.join(DATA_DIR, "vacancies"))).toEqual([]);
  expect(await filesIn(path.join(DATA_DIR, "cvs"))).toEqual([]);
});
