import { expect, test } from "@playwright/test";

// AC-006 de gmail-oauth: con el Google falso del stack, conectar abre el consentimiento en otra
// pestaña, el loopback guarda el token y la vista pasa a mostrar la cuenta.
test("conecta Gmail y muestra la cuenta conectada", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Gmail" }).click();

  const state = page.locator('[data-id="gmail-connection-view__state"]');
  await expect(state).toHaveText("Desconectado");

  const consent = context.waitForEvent("page");
  await page.getByRole("button", { name: "Conectar Gmail" }).click();
  const tab = await consent;
  await expect(tab.getByText("Gmail conectado")).toBeVisible();
  await tab.close();

  await expect(state).toHaveText("Conectado");
  await expect(page.getByText("Cuenta conectada: postulante@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar Gmail" })).toHaveCount(0);
});
