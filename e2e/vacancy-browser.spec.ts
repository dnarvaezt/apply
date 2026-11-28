import { expect, test } from "@playwright/test";
import { FAKE_PAGE_TEXT } from "./support/fake-claude.ts";

const URL = "https://jobs.example.com/view/42";

test("#69: 'Con Chrome' analiza la vacante desde su URL", async ({ page, request }) => {
  await page.goto("/vacancies/new");
  await page.getByRole("tab", { name: "Con Chrome" }).click();
  const add = page.getByRole("button", { name: "Analizar vacante" });
  await expect(add).toBeDisabled();
  await page.getByLabel("URL de la vacante").fill(URL);
  await add.click();
  await expect(page.getByText("Vacante analizada: Ingeniera Backend E2E")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ingeniera Backend E2E" })).toBeVisible();

  const list = (await (await request.get("/api/vacancies")).json()) as {
    id: string;
    sourceUrl: string | null;
    rawText: string;
  }[];
  expect(list).toEqual([expect.objectContaining({ sourceUrl: URL, rawText: FAKE_PAGE_TEXT })]);

  // Limpieza: otros specs esperan la base de vacantes vacía.
  for (const { id } of list) await request.delete(`/api/vacancies/${id}`);
});
