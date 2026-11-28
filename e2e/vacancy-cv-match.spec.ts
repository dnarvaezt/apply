import { expect, test } from "@playwright/test";
import { createVacancyFromText, deleteOpenVacancy, openDetailTab } from "./support/vacancy-ui.ts";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

test("AC-006 (#16): el CV abierto muestra su cobertura frente a la vacante y se recalcula al editarlo", async ({
  page,
  request,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await createVacancyFromText(page, VACANCY_TEXT);
  await openDetailTab(page, "CV");
  await page.getByRole("button", { name: /Generar CV para esta vacante/ }).click();
  await expect(page.getByText("CV generado y guardado")).toBeVisible({ timeout: 180_000 });

  // Vacante falsa: mustHave TypeScript y PostgreSQL, niceToHave Docker, keywords typescript y
  // postgres. El CV falso nombra TypeScript y PostgreSQL en el resumen y no menciona Docker.
  const panel = page.locator('[data-id="cv-match-panel"]');
  await expect(panel.getByText("Cobertura frente a la vacante")).toBeVisible({ timeout: 60_000 });
  const rows = panel.locator('[data-id="cv-match-requirement"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("TypeScript");
  await expect(rows.nth(0)).toContainText("fuerte");
  await expect(rows.nth(0)).toContainText("Ana Pérez > Resumen");
  await expect(rows.nth(0)).toContainText("Ingeniera con experiencia en TypeScript y PostgreSQL.");
  await expect(rows.nth(1)).toContainText("PostgreSQL");
  await expect(rows.nth(1)).toContainText("fuerte");
  await expect(rows.nth(2)).toContainText("Docker");
  await expect(rows.nth(2)).toContainText("débil");
  await expect(rows.nth(2)).toContainText("Sin evidencia en el CV");
  await expect(panel.locator('[data-id="cv-match-coverage"]')).toHaveText("100 %");
  const keywordsCoverage = panel.locator('[data-id="cv-match-keyword-coverage"]');
  await expect(keywordsCoverage).toHaveText("50 %");
  await expect(panel.getByText("Palabras clave ausentes")).toBeVisible();
  await expect(panel.getByText("postgres", { exact: true })).toBeVisible();

  // Editar el CV y guardar recalcula el informe con el contenido nuevo.
  await page.getByRole("tab", { name: "Editar" }).click();
  await page
    .locator("textarea.font-mono")
    .fill("# Ana Pérez\n\n## Resumen\n\nIngeniera con TypeScript, PostgreSQL y postgres.\n");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await expect(keywordsCoverage).toHaveText("100 %", { timeout: 60_000 });
  await expect(panel.getByText("Palabras clave ausentes")).toHaveCount(0);

  // Limpiar: los demás specs del proyecto ui esperan una base vacía.
  await page.getByRole("button", { name: "Eliminar CV" }).click();
  await expect(page.getByText("Aún no hay un CV para esta vacante")).toBeVisible();
  await deleteOpenVacancy(page);
  expect(await (await request.get(`${API}/api/cvs`)).json()).toEqual([]);
});
