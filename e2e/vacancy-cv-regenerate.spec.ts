import type { CvMeta } from "@apply/shared";
import { expect, test } from "@playwright/test";
import { createVacancyFromText, deleteOpenVacancy, openDetailTab } from "./support/vacancy-ui.ts";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

test("#76: la vacante tiene un único CV y regenerarlo con IA elimina el actual y crea uno nuevo", async ({
  page,
  request,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());

  await createVacancyFromText(page, VACANCY_TEXT);
  await openDetailTab(page, "CV");
  await page.getByRole("button", { name: /Generar CV para esta vacante/ }).click();
  await expect(page.getByText("CV generado y guardado")).toBeVisible({ timeout: 180_000 });
  const [cv] = (await (await request.get(`${API}/api/cvs`)).json()) as CvMeta[];
  expect(cv).toBeDefined();

  // La cobertura vive en el tab Match y el envío por Gmail ya no está en el tab CV.
  await expect(page.getByText("Cobertura frente a la vacante")).toHaveCount(0);
  await expect(page.getByText("Correo de postulación")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Nuevo CV/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "Editar" }).click();
  await page
    .locator("textarea.font-mono")
    .fill("# Ana Pérez\n\nEditado a mano antes de regenerar\n");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Regenerar con IA/ }).click();
  await page.getByRole("button", { name: "Regenerar CV" }).click();
  await expect(page.getByText("CV regenerado y guardado")).toBeVisible({ timeout: 180_000 });
  await page.getByRole("tab", { name: "Editar" }).click();
  await expect(page.locator("textarea.font-mono")).not.toHaveValue(/Editado a mano/);

  const after = (await (await request.get(`${API}/api/cvs`)).json()) as CvMeta[];
  expect(after).toHaveLength(1);
  expect(after[0]?.id).not.toBe(cv?.id);
  expect((await request.get(`${API}/api/cvs/${cv?.id}`)).status()).toBe(404);

  // `/cvs/[id]` lleva al tab CV de su vacante (#73), ya sin `?cv=`.
  await page.goto(`/cvs/${after[0]?.id}`);
  await expect(page).toHaveURL(new RegExp(`/vacancies/${cv?.vacancyId}\\?tab=cv$`));
  await expect(page.getByRole("tab", { name: "Vista previa" })).toBeVisible();

  // Limpiar: los demás specs del proyecto ui esperan una base vacía.
  await page.getByRole("button", { name: "Eliminar CV" }).click();
  await expect(page.getByText("Aún no hay un CV para esta vacante")).toBeVisible();
  await deleteOpenVacancy(page);
  expect(await (await request.get(`${API}/api/cvs`)).json()).toEqual([]);
});
