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
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Postulaciones/ })
    .click();
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

test("AC-005 (#20): registrar a mano postulación, contacto y entrevista desde la vista", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openPipeline(page);

  const created = page.locator('[data-id="new-application-form"]');
  await created.getByLabel("Vacante", { exact: true }).selectOption(vacancy.id);
  await created.getByLabel("Canal", { exact: true }).selectOption("ats");
  await created.getByLabel("Fecha", { exact: true }).fill("2026-11-02T09:00");
  await created.getByRole("button", { name: "Registrar postulación" }).click();
  await expect(page.getByText("Postulación registrada")).toBeVisible();

  const timeline = page.locator('[data-id="application-timeline"] li');
  await expect(timeline).toHaveCount(1);
  await expect(timeline.first()).toContainText("ATS");

  const contacts = page.locator('[data-id="contacts-panel"]');
  await contacts.getByRole("button", { name: "Agregar contacto" }).click();
  const contactForm = contacts.locator('[data-id="contact-form"]');
  await contactForm.getByLabel("Nombre").fill("Laura Gómez");
  await contactForm.getByLabel("LinkedIn").fill("https://www.linkedin.com/in/laura-ejemplo");
  await contactForm.getByLabel("Inició el proceso").check();
  await contactForm.getByRole("button", { name: "Agregar contacto" }).click();
  await expect(page.getByText("Contacto agregado")).toBeVisible();
  const laura = contacts.locator('[data-id="contacts-panel__contact"]');
  await expect(laura).toContainText("Laura Gómez");
  await expect(laura).toContainText("Inicio del proceso");

  const eventForm = page.locator('[data-id="event-form"]');
  await eventForm.getByLabel("Tipo").selectOption("interview");
  await eventForm.getByLabel("Canal").selectOption("linkedin");
  await eventForm.getByLabel("Fecha", { exact: true }).fill("2026-11-03T16:30");
  await eventForm.getByLabel("Contacto").selectOption({ label: "Laura Gómez" });
  await eventForm.getByRole("button", { name: "Registrar evento" }).click();
  await expect(page.getByText("Evento registrado")).toBeVisible();

  await expect(timeline).toHaveCount(2);
  await expect(timeline.nth(1)).toContainText("Entrevista");
  await expect(timeline.nth(1)).toContainText("LinkedIn");
  await expect(timeline.nth(1)).toContainText("con Laura Gómez");
  await expect(page.locator('[data-id="application-detail__status"]')).toContainText("Entrevista");

  const [stored] = (await (
    await request.get(`${API}/applications?vacancyId=${vacancy.id}`)
  ).json()) as Application[];
  expect(stored?.status).toBe("interview");
});
