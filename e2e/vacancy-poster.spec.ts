import { expect, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;

const VACANCY_TEXT =
  "Senior Backend Engineer. Meet the hiring team: Laura Gómez, Technical Recruiter. Publicado hace 3 días. Buscamos TypeScript y PostgreSQL.";

test("AC-007: ver poster y fecha extraídos, corregirlos y verlos tras recargar (Anthropic falso)", async ({
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

  // Extraídos por Claude (falso): poster y fecha relativa "hace 3 días"
  const publication = page.getByRole("region", { name: "Publicación" });
  await expect(publication.getByLabel("Publicada por")).toHaveValue("Laura Gómez");
  await expect(publication.getByLabel("Cargo de quien publica")).toHaveValue("Technical Recruiter");
  const [created] = (await (await request.get(`${API}/api/vacancies`)).json()) as {
    id: string;
    createdAt: string;
    postedAt: string;
  }[];
  const expectedDay = new Date(Date.parse(created.createdAt) - 3 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await expect(publication.getByLabel("Fecha de publicación")).toHaveValue(expectedDay);
  await expect(publication.getByText(/\(aprox\.\)/)).toBeVisible();

  // Corregirlos a mano
  await publication.getByLabel("Publicada por").fill("Marta Ruiz");
  await publication.getByLabel("Cargo de quien publica").fill("Engineering Manager");
  await publication.getByLabel("Perfil de quien publica").fill("https://example.com/in/marta");
  await publication.getByLabel("Fecha de publicación").fill("2026-02-10");
  await publication.getByRole("button", { name: "Guardar publicación" }).click();
  await expect(page.getByText("Datos de publicación guardados")).toBeVisible();

  // Persisten al recargar y la fecha manual queda exacta
  await page.reload();
  const reloaded = page.getByRole("region", { name: "Publicación" });
  await expect(reloaded.getByLabel("Publicada por")).toHaveValue("Marta Ruiz");
  await expect(reloaded.getByLabel("Cargo de quien publica")).toHaveValue("Engineering Manager");
  await expect(reloaded.getByLabel("Perfil de quien publica")).toHaveValue(
    "https://example.com/in/marta",
  );
  await expect(reloaded.getByLabel("Fecha de publicación")).toHaveValue("2026-02-10");
  await expect(reloaded.getByText("Publicada el 10/2/2026")).toBeVisible();

  const [saved] = (await (await request.get(`${API}/api/vacancies`)).json()) as {
    postedAtPrecision: string;
  }[];
  expect(saved.postedAtPrecision).toBe("exact");

  await page.getByRole("button", { name: "Eliminar vacante" }).click();
  await expect(page.getByText("Aún no hay vacantes.")).toBeVisible();
});
