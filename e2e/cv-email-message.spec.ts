import { expect, test } from "@playwright/test";
import { createVacancyFromText, deleteOpenVacancy, openDetailTab } from "./support/vacancy-ui.ts";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para operar APIs en producción. Trabajo remoto.";

test("#76: desde el CV se genera el mensaje de correo, se copia y persiste al recargar", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("dialog", (dialog) => void dialog.accept());

  await createVacancyFromText(page, VACANCY_TEXT);
  await openDetailTab(page, "CV");
  await page.getByRole("button", { name: /Generar CV para esta vacante/ }).click();
  await expect(page.getByText("CV generado y guardado")).toBeVisible({ timeout: 180_000 });

  const panel = page.locator('[data-id="cv-email-message"]');
  await panel.getByRole("button", { name: "Generar mensaje de correo" }).click();

  // La vacante falsa la publicó Laura Gómez: el saludo usa su nombre.
  await expect(panel.getByText("Postulación: Ingeniera Backend E2E")).toBeVisible();
  await expect(panel.getByText(/^Hola Laura,\s+Me interesa el rol/)).toBeVisible();

  await panel.getByRole("button", { name: "Copiar asunto" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Postulación: Ingeniera Backend E2E",
  );
  await panel.getByRole("button", { name: "Copiar mensaje" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Hola Laura,\n\n/);

  await page.reload();
  const reloaded = page.locator('[data-id="cv-email-message"]');
  await expect(reloaded.getByText("Postulación: Ingeniera Backend E2E")).toBeVisible();
  await expect(reloaded.getByRole("button", { name: "Regenerar mensaje" })).toBeVisible();

  // Limpiar: los demás specs del proyecto ui esperan una base vacía. Borrar el CV borra su mensaje.
  await page.getByRole("button", { name: "Eliminar CV" }).click();
  await expect(page.getByText("Aún no hay un CV para esta vacante")).toBeVisible();
  await deleteOpenVacancy(page);
  expect(await (await request.get(`${API}/api/cvs`)).json()).toEqual([]);
});
