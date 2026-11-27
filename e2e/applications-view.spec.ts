import type { Application, CvMeta, Vacancy } from "@apply/shared";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

async function createVacancy(request: APIRequestContext): Promise<Vacancy> {
  const res = await request.post(`${API}/vacancies`, { data: { text: VACANCY_TEXT } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Vacancy;
}

async function openPipeline(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: /Postulaciones/ }).click();
}

// Corre antes que applications.spec.ts (orden alfabético, un worker): la base aún no tiene
// postulaciones y los specs del proyecto `ui` dejaron todo limpio.
test("AC-005 (#18): sin postulaciones muestra el estado vacío", async ({ page }) => {
  await openPipeline(page);
  await expect(page.getByText("Aún no hay postulaciones")).toBeVisible();
});

test("AC-003 (#18): crear una postulación desde la vista la deja en applied con su evento", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const vacancy = await createVacancy(request);
  const generated = await request.post(`${API}/cvs/generate`, {
    data: { vacancyId: vacancy.id, instructions: "" },
    timeout: 180_000,
  });
  expect(generated.ok()).toBe(true);
  expect(await generated.text()).toContain("event: done");
  const cvs = (await (await request.get(`${API}/cvs`)).json()) as CvMeta[];
  const cv = cvs.find((c) => c.vacancyId === vacancy.id);
  expect(cv).toBeDefined();

  await openPipeline(page);
  await page.getByLabel("Vacante", { exact: true }).selectOption(vacancy.id);
  await page.getByLabel("CV", { exact: true }).selectOption(cv?.id ?? "");
  await page.getByRole("button", { name: "Registrar postulación" }).click();
  await expect(page.getByText("Postulación registrada")).toBeVisible();

  const items = page.locator('[data-id="applications-list"] li');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(vacancy.title);
  await expect(items.first()).toContainText("Postulada");
  await expect(items.first()).toContainText("Activa");

  const timeline = page.locator('[data-id="application-timeline"] li');
  await expect(timeline).toHaveCount(1);
  await expect(timeline.first()).toContainText("Postulada");
  await expect(timeline.first()).toContainText("manual");
  await expect(timeline.first()).toContainText(new Date().toISOString().slice(0, 10));

  const [created] = (await (
    await request.get(`${API}/applications?vacancyId=${vacancy.id}`)
  ).json()) as Application[];
  expect(created).toMatchObject({ status: "applied", active: true, cvId: cv?.id });
});

test("AC-004 (#18): filtrar por cerradas deja solo las terminales", async ({ page, request }) => {
  const create = async () => {
    const vacancy = await createVacancy(request);
    const res = await request.post(`${API}/applications`, { data: { vacancyId: vacancy.id } });
    expect(res.status()).toBe(201);
    return (await res.json()) as Application;
  };
  const addEvent = async (id: string, type: string) => {
    const res = await request.post(`${API}/applications/${id}/events`, {
      data: { type, source: "manual" },
    });
    expect(res.status()).toBe(201);
  };
  const rejected = await create();
  await addEvent(rejected.id, "rejected");
  const interview = await create();
  await addEvent(interview.id, "interview");

  await openPipeline(page);
  const items = page.locator('[data-id="applications-list"] li');
  await expect(items.filter({ hasText: "Entrevista" })).not.toHaveCount(0);

  await page.getByLabel("Activa o cerrada").selectOption("closed");
  await expect(items.filter({ hasText: "Rechazada" })).not.toHaveCount(0);
  await expect(items.filter({ hasText: "Activa" })).toHaveCount(0);
  await expect(items.filter({ hasText: "Entrevista" })).toHaveCount(0);
  for (const item of await items.all()) await expect(item).toContainText("Cerrada");
});
