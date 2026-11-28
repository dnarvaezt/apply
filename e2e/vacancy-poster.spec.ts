import { expect, test } from "@playwright/test";
import { createVacancyFromText, deleteOpenVacancy } from "./support/vacancy-ui.ts";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Senior Backend Engineer. Meet the hiring team: Laura Gómez, Technical Recruiter. Publicado hace 3 días. Buscamos TypeScript y PostgreSQL.";

test("AC-007: ver poster y fecha extraídos, corregirlos y verlos tras recargar (claude falso)", async ({
  page,
  request,
}) => {
  await createVacancyFromText(page, VACANCY_TEXT);

  // Extraídos por Claude (falso): poster y fecha relativa "hace 3 días", aproximada
  const [created] = (await (await request.get(`${API}/api/vacancies`)).json()) as {
    id: string;
    createdAt: string;
  }[];
  const expectedDay = new Date(Date.parse(created.createdAt) - 3 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const publication = page.getByRole("region", { name: "Publicación" });
  await expect(publication).toContainText("Laura Gómez · Technical Recruiter");
  await expect(publication.getByText(/\(aprox\.\)/)).toBeVisible();

  // Corregirlos en la página de edición
  await page.getByRole("link", { name: "Editar" }).click();
  // Primera visita a /edit: `next dev` compila la ruta en frío (~11 s medidos; ~0,5 s en caliente).
  await expect(page).toHaveURL(/\/edit$/, { timeout: 30_000 });
  const form = page.getByRole("group", { name: "Publicación" });
  await expect(form.getByLabel("Publicada por")).toHaveValue("Laura Gómez");
  await expect(form.getByLabel("Cargo de quien publica")).toHaveValue("Technical Recruiter");
  await expect(form.getByLabel("Fecha de publicación")).toHaveValue(expectedDay);
  await form.getByLabel("Publicada por").fill("Marta Ruiz");
  await form.getByLabel("Cargo de quien publica").fill("Engineering Manager");
  await form.getByLabel("Perfil de quien publica").fill("https://example.com/in/marta");
  await form.getByLabel("Fecha de publicación").fill("2026-02-10");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Vacante guardada")).toBeVisible();

  // De vuelta en el detalle, y persisten al recargar con la fecha manual exacta
  await expect(page).toHaveURL(new RegExp(`/vacancies/${created.id}$`));
  await page.reload();
  const reloaded = page.getByRole("region", { name: "Publicación" });
  await expect(reloaded.getByText("Publicada el 10/2/2026")).toBeVisible();
  await expect(reloaded.getByRole("link", { name: "Marta Ruiz" })).toHaveAttribute(
    "href",
    "https://example.com/in/marta",
  );
  await expect(reloaded).toContainText("Engineering Manager");

  const [saved] = (await (await request.get(`${API}/api/vacancies`)).json()) as {
    postedAtPrecision: string;
  }[];
  expect(saved.postedAtPrecision).toBe("exact");

  await deleteOpenVacancy(page);
});
