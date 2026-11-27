import { expect, test } from "@playwright/test";

// PNG de 1x1: el claude falso no decodifica la imagen, solo detecta el bloque `image`.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);

async function pickImage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Desde imagen" }).click();
  await page.getByLabel("Captura de la vacante").setInputFiles({
    name: "vacante.png",
    mimeType: "image/png",
    buffer: PNG,
  });
}

test("AC-007: sube un PNG en 'Desde imagen' y ve la vacante en la lista", async ({
  page,
  request,
}) => {
  await pickImage(page);
  await page.getByRole("button", { name: "Agregar vacante" }).click();
  await expect(page.getByText("Vacante analizada: Ingeniera Backend E2E")).toBeVisible();
  await expect(page.getByText("Vacantes (1)")).toBeVisible();

  // Limpieza: otros specs esperan la base de vacantes vacía.
  const list = (await (await request.get("/api/vacancies")).json()) as { id: string }[];
  for (const { id } of list) await request.delete(`/api/vacancies/${id}`);
});

test("AC-007: muestra el mensaje del API ante un 422", async ({ page }) => {
  await page.route("**/api/vacancies", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: "No se pudo leer texto suficiente de la imagen" }),
        })
      : route.continue(),
  );
  await pickImage(page);
  await page.getByRole("button", { name: "Agregar vacante" }).click();
  await expect(page.getByText("No se pudo leer texto suficiente de la imagen")).toBeVisible();
});
