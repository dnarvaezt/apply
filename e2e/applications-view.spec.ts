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

/** La postulación vive en el tab "Línea de tiempo" del detalle de su vacante (#73). */
async function openVacancy(page: Page, vacancy: Vacancy) {
  await page.goto(`/vacancies/${vacancy.id}?tab=application`);
  await expect(page.getByRole("heading", { name: vacancy.title })).toBeVisible();
}

const status = (page: Page) => page.locator('[data-id="status-stepper"]');

test("AC-005 (#18): una vacante sin postulación lo dice y ofrece registrarla", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openVacancy(page, vacancy);
  const panel = page.locator('[data-id="application-panel"]');
  await expect(panel.getByText("Aún no te postulaste a esta vacante.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Registrar postulación" })).toBeVisible();
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

  await openVacancy(page, vacancy);
  // El CV más reciente de la vacante viene elegido.
  await expect(page.getByLabel("CV", { exact: true })).toHaveValue(cv?.id ?? "");
  await page.getByRole("button", { name: "Registrar postulación" }).click();
  await expect(page.getByText("Postulación registrada")).toBeVisible();
  await expect(status(page)).toContainText("Postulada");

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

test("AC-004 (#73): la lista de vacantes muestra el estado de cada postulación", async ({
  page,
  request,
}) => {
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

  await page.goto("/vacancies");
  const cards = page.locator('[data-id="vacancy-list"] li');
  await expect(cards.filter({ hasText: "Rechazada" })).not.toHaveCount(0);
  await expect(cards.filter({ hasText: "Entrevista" })).not.toHaveCount(0);

  await cards.filter({ hasText: "Rechazada" }).first().getByRole("link").click();
  await page.getByRole("tab", { name: "Línea de tiempo", exact: true }).click();
  await expect(page).toHaveURL(/[?&]tab=application/);
  await expect(status(page)).toContainText("Rechazada");
});

test("AC-005 (#20): registrar a mano postulación, contacto y entrevista desde la vista", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openVacancy(page, vacancy);

  const created = page.locator('[data-id="new-application-form"]');
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
  await expect(status(page)).toContainText("Entrevista");

  const [stored] = (await (
    await request.get(`${API}/applications?vacancyId=${vacancy.id}`)
  ).json()) as Application[];
  expect(stored?.status).toBe("interview");
});

test("#73: la línea de tiempo registra prueba técnica (cambia el estado) y notas (no lo cambian)", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  const res = await request.post(`${API}/applications`, { data: { vacancyId: vacancy.id } });
  expect(res.status()).toBe(201);
  await openVacancy(page, vacancy);

  const eventForm = page.locator('[data-id="event-form"]');
  const timeline = page.locator('[data-id="application-timeline"] li');
  await expect(timeline).toHaveCount(1);

  await eventForm.getByLabel("Tipo").selectOption("assessment");
  await eventForm.getByRole("button", { name: "Registrar evento" }).click();
  await expect(timeline).toHaveCount(2);
  await expect(timeline.nth(1)).toContainText("Prueba técnica");
  await expect(status(page).getByText("Prueba técnica").first()).toBeVisible();

  await eventForm.getByLabel("Tipo").selectOption("note");
  await eventForm.getByLabel("Notas").fill("Enviaron el reto por correo");
  await eventForm.getByRole("button", { name: "Registrar evento" }).click();
  await expect(timeline).toHaveCount(3);
  await expect(timeline.nth(2)).toContainText("Nota");
  await expect(timeline.nth(2)).toContainText("Enviaron el reto por correo");

  const [stored] = (await (
    await request.get(`${API}/applications?vacancyId=${vacancy.id}`)
  ).json()) as Application[];
  expect(stored?.status).toBe("assessment");
});
