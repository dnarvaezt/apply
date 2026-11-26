import { expect, test } from "@playwright/test";

test("Reindexar en Mi perfil guarda el índice en Postgres y muestra el estado al día", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Mi perfil/ }).click();

  const card = page.locator("[data-slot=card]", { hasText: "Índice RAG" });
  await card.getByRole("button", { name: "Reindexar" }).click();
  await expect(page.getByText("Índice reconstruido")).toBeVisible({ timeout: 200_000 });
  await expect(card.getByText("Al día")).toBeVisible();
  await expect(card.getByText(/\d+ fragmentos de \d+ archivos/)).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: /Mi perfil/ }).click();
  await expect(card.getByText("Al día")).toBeVisible();
  await expect(card.getByText(/\d+ fragmentos de \d+ archivos/)).toBeVisible();
});
