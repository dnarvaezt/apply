import { expect, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para operar APIs en producción. Trabajo remoto.";

test("AC-006 (#19): desde un CV se genera el correo, se edita el asunto y persiste al recargar", async ({
  page,
  request,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto("/");
  await page
    .getByPlaceholder("Pega aquí la descripción completa de la vacante…")
    .fill(VACANCY_TEXT);
  await page.getByRole("button", { name: "Agregar vacante" }).click();
  await expect(page.getByText("Vacante analizada: Ingeniera Backend E2E")).toBeVisible();
  await page.getByRole("button", { name: /Generar CV para esta vacante/ }).click();
  await expect(page.getByText("CV generado y guardado")).toBeVisible({ timeout: 180_000 });

  const panel = page.locator('[data-id="cv-email-draft"]');
  await expect(panel.getByText("Aún no hay correo para este CV.")).toBeVisible();
  await panel.getByRole("button", { name: "Generar correo" }).click();

  // La vacante falsa la publicó Laura Gómez y no trae email: el saludo usa su nombre y el
  // destinatario queda vacío y marcado (C7).
  const subject = panel.getByLabel("Asunto");
  await expect(subject).toHaveValue("Postulación: Ingeniera Backend E2E");
  await expect(panel.getByLabel("Cuerpo")).toHaveValue(/^Hola Laura,\n\nMe interesa el rol/);
  await expect(panel.getByLabel("Para")).toHaveValue("");
  await expect(panel.getByText(/Falta el destinatario/)).toBeVisible();

  await subject.fill("Postulación editada");
  await panel.getByLabel("Para").fill("talento@example.com");
  await panel.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(panel.getByText("Borrador guardado")).toBeVisible();

  await page.reload();
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /CVs/ })
    .click();
  const reloaded = page.locator('[data-id="cv-email-draft"]');
  await expect(reloaded.getByLabel("Asunto")).toHaveValue("Postulación editada");
  await expect(reloaded.getByLabel("Para")).toHaveValue("talento@example.com");
  await expect(reloaded.getByText(/Falta el destinatario/)).toHaveCount(0);

  // Limpiar: los demás specs del proyecto ui esperan una base vacía. Borrar el CV borra su borrador.
  await page.getByRole("button", { name: "Eliminar CV" }).click();
  await expect(page.getByText("Genera uno desde la pestaña Vacantes.")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Vacantes/ })
    .click();
  await page.getByRole("button", { name: "Eliminar vacante" }).click();
  await expect(page.getByText("Aún no hay vacantes.")).toBeVisible();
  expect(await (await request.get(`${API}/api/cvs`)).json()).toEqual([]);
});
