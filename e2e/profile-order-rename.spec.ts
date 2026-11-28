import { expect, type Page, test } from "@playwright/test";

const openProfile = async (page: Page) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Mi perfil/ })
    .click();
};
const fileList = (page: Page) => page.locator("[data-id=profile-file-list__items] > li");

test("renombrar un archivo del perfil conserva .md y el borrador sin guardar", async ({ page }) => {
  await openProfile(page);
  await page.getByPlaceholder("60-nuevo.md").fill("90-e2e-borrador");
  await page.getByRole("button", { name: "Crear archivo" }).click();
  await expect(page.getByRole("button", { name: "90-e2e-borrador.md", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/profile\/90-e2e-borrador\.md$/);

  await page.locator("textarea").fill("# Texto sin guardar");
  await page.getByRole("button", { name: "Renombrar 90-e2e-borrador.md" }).click();
  await page.getByLabel("Nuevo nombre de 90-e2e-borrador.md").fill("91-e2e-renombrado");
  await page.getByRole("button", { name: "Guardar nombre" }).click();

  await expect(
    page.getByRole("button", { name: "91-e2e-renombrado.md", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/profile\/91-e2e-renombrado\.md$/);
  await expect(page.locator("textarea")).toHaveValue("# Texto sin guardar");

  // Un nombre ya usado se rechaza y no toca nada.
  await page.getByRole("button", { name: "Renombrar 91-e2e-renombrado.md" }).click();
  await page.getByLabel("Nuevo nombre de 91-e2e-renombrado.md").fill("00-contacto");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByText("Ya existe un archivo llamado 00-contacto.md")).toBeVisible();
  await page.getByLabel("Nuevo nombre de 91-e2e-renombrado.md").press("Escape");

  await page.getByRole("button", { name: "Eliminar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar archivo" }).click();
  await expect(page.getByRole("button", { name: "91-e2e-renombrado.md", exact: true })).toHaveCount(
    0,
  );
});

test("el orden personalizado y el A–Z del perfil persisten al recargar", async ({ page }) => {
  await openProfile(page);
  await expect(fileList(page).first()).toContainText("00-contacto.md");

  await page.getByRole("button", { name: "Personalizado" }).click();
  await page.getByRole("button", { name: "Subir 10-experiencia.md" }).click();
  await expect(fileList(page).first()).toContainText("10-experiencia.md");

  await page.reload();
  await expect(page.getByRole("button", { name: "Personalizado" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(fileList(page).first()).toContainText("10-experiencia.md");
  await expect(fileList(page).nth(1)).toContainText("00-contacto.md");

  await page.getByRole("button", { name: "A–Z" }).click();
  await expect(fileList(page).first()).toContainText("00-contacto.md");
  await expect(page.getByRole("button", { name: /^Subir/ })).toHaveCount(0);
  await page.reload();
  await expect(fileList(page).first()).toContainText("00-contacto.md");
});
