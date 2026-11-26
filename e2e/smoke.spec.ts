import { expect, test } from "@playwright/test";

test("el perfil se carga de la API, se edita y persiste tras recargar", async ({
  page,
  request,
}) => {
  const health = await request.get("http://localhost:3101/api/health");
  expect(health.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Apply" })).toBeVisible();
  await expect(
    page.getByPlaceholder("Pega aquí la descripción completa de la vacante…"),
  ).toBeVisible();

  await page.getByRole("tab", { name: /Mi perfil/ }).click();
  await page.getByRole("button", { name: "00-contacto.md" }).click();

  const editor = page.locator("textarea:not([placeholder])");
  await expect(editor).toHaveValue(/# Contacto/);

  const marker = `Nota e2e ${Date.now()}`;
  await editor.fill(`# Contacto\n\n${marker}\n`);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: /Mi perfil/ }).click();
  await page.getByRole("button", { name: "00-contacto.md" }).click();
  await expect(page.locator("textarea:not([placeholder])")).toHaveValue(new RegExp(marker));
});

test("POST /api/vacancies con una URL de LinkedIn y sin texto pide pegar el texto", async ({
  request,
}) => {
  const res = await request.post("http://localhost:3101/api/vacancies", {
    data: { url: "https://www.linkedin.com/jobs/view/1" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  const body = (await res.json()) as { error: string };
  expect(body.error).toContain("Pega el texto de la vacante");
});
