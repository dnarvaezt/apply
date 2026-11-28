import { expect, type Page } from "@playwright/test";

/** Crea una vacante pegando su texto en `/vacancies/new` y espera a quedar en su detalle. */
export async function createVacancyFromText(page: Page, text: string): Promise<void> {
  await page.goto("/vacancies/new");
  await page.getByPlaceholder("Pega aquí la descripción completa de la vacante…").fill(text);
  await page.getByRole("button", { name: "Analizar vacante" }).click();
  await expect(page.getByText("Vacante analizada: Ingeniera Backend E2E")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingeniera Backend E2E" })).toBeVisible();
}

/** Abre una sección del detalle de la vacante y espera que la URL la fije en `?tab=`. */
export async function openDetailTab(
  page: Page,
  name: "Vacante" | "CV" | "Match" | "Línea de tiempo",
): Promise<void> {
  await page.getByRole("tab", { name, exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/** Confirma en el AlertDialog de shadcn abierto con el botón que repite el verbo (#79). */
export async function confirmInDialog(page: Page, action: string): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: action, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Elimina la vacante abierta en su detalle y espera la lista vacía. */
export async function deleteOpenVacancy(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await confirmInDialog(page, "Eliminar vacante");
  await expect(page).toHaveURL(/\/vacancies$/);
  await expect(page.getByText("Aún no hay vacantes")).toBeVisible();
}
