import type { Vacancy, VacancyProcess, VacancyStatus } from "@apply/shared";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

async function createVacancy(request: APIRequestContext): Promise<Vacancy> {
  const res = await request.post(`${API}/vacancies`, { data: { text: VACANCY_TEXT } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Vacancy;
}

async function readProcess(request: APIRequestContext, vacancy: Vacancy) {
  const res = await request.get(`${API}/vacancies/${vacancy.id}/process`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as VacancyProcess;
}

/** El proceso vive en el tab "Proceso" del detalle de su vacante (#82). */
async function openProcess(page: Page, vacancy: Vacancy) {
  await page.goto(`/vacancies/${vacancy.id}?tab=process`);
  await expect(page.getByRole("heading", { name: vacancy.title })).toBeVisible();
}

const status = (page: Page) => page.locator('[data-id="process-panel__status"]');
const history = (page: Page) => page.locator('[data-id="status-history__item"]');

async function moveTo(
  page: Page,
  to: VacancyStatus,
  fields: { channel?: string; occurredAt?: string; note?: string; reason?: string } = {},
) {
  await page.getByRole("button", { name: "Mover a…" }).click();
  const dialog = page.getByRole("dialog", { name: "Mover la vacante" });
  await dialog.getByLabel("Nuevo estado").selectOption(to);
  if (fields.reason) await dialog.getByLabel("Motivo del descarte").selectOption(fields.reason);
  if (fields.channel) await dialog.getByLabel("Canal").selectOption(fields.channel);
  if (fields.occurredAt) await dialog.getByLabel("Fecha", { exact: true }).fill(fields.occurredAt);
  if (fields.note) await dialog.getByLabel("Nota (opcional)").fill(fields.note);
  await dialog.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("#82: una vacante nueva está en «Por postular», sin historial, y ofrece Mover a…", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openProcess(page, vacancy);
  await expect(status(page)).toContainText("Por postular");
  await expect(
    page.getByText("Sin cambios todavía: la vacante sigue en «Por postular»."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mover a…" })).toBeVisible();
});

test("#82: mover a Postulada con canal, fecha y nota deja el cambio en el historial y en la API", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openProcess(page, vacancy);
  await moveTo(page, "applied", {
    channel: "ats",
    occurredAt: "2026-11-02T09:00",
    note: "Enviado por el portal",
  });
  await expect(page.getByText("Movida a «Postulada»")).toBeVisible();
  await expect(status(page)).toContainText("Postulada");
  await expect(history(page)).toHaveCount(1);
  await expect(history(page).first()).toContainText("Por postular");
  await expect(history(page).first()).toContainText("Postulada");
  await expect(history(page).first()).toContainText("ATS");
  await expect(history(page).first()).toContainText("Enviado por el portal");

  const stored = await readProcess(request, vacancy);
  expect(stored.status).toBe("applied");
  expect(stored.history).toMatchObject([
    {
      from: "to_apply",
      to: "applied",
      channel: "ats",
      note: "Enviado por el portal",
      source: "manual",
      occurredAt: new Date(2026, 10, 2, 9, 0).toISOString(),
    },
  ]);
});

test("#82: la lista de vacantes muestra el estado de cada una y filtra por estado", async ({
  page,
  request,
}) => {
  const move = async (vacancy: Vacancy, data: Record<string, string>) => {
    const res = await request.post(`${API}/vacancies/${vacancy.id}/status`, { data });
    expect(res.status()).toBe(201);
  };
  const closed = await createVacancy(request);
  await move(closed, { to: "discarded", discardReason: "closed" });
  const interview = await createVacancy(request);
  await move(interview, { to: "interview" });

  await page.goto("/vacancies");
  const cards = page.locator('[data-id="vacancy-list"] li');
  await expect(cards.filter({ hasText: "Descartada (vacante cerrada)" })).not.toHaveCount(0);
  await expect(cards.filter({ hasText: "Entrevista" })).not.toHaveCount(0);

  await page.getByLabel("Estado").selectOption("interview");
  await expect(cards.filter({ hasText: "Descartada" })).toHaveCount(0);
  await expect(cards.filter({ hasText: "Entrevista" })).not.toHaveCount(0);

  await page.getByLabel("Estado").selectOption("discarded");
  await cards.filter({ hasText: "Descartada (vacante cerrada)" }).first().getByRole("link").click();
  await page.getByRole("tab", { name: "Proceso", exact: true }).click();
  await expect(page).toHaveURL(/[?&]tab=process/);
  await expect(status(page)).toContainText("Descartada (vacante cerrada)");
});

test("#82: el enlace viejo ?tab=application abre el tab Proceso", async ({ page, request }) => {
  const vacancy = await createVacancy(request);
  await page.goto(`/vacancies/${vacancy.id}?tab=application`);
  await expect(page.getByRole("tab", { name: "Proceso", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(status(page)).toContainText("Por postular");
});

test("#82: registrar un contacto y moverse a Entrevista con su nota", async ({ page, request }) => {
  const vacancy = await createVacancy(request);
  await openProcess(page, vacancy);

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

  await moveTo(page, "applied");
  await moveTo(page, "interview", {
    channel: "linkedin",
    note: "Entrevista técnica con Laura el jueves",
  });
  await expect(status(page)).toContainText("Entrevista");
  // El más reciente primero.
  await expect(history(page)).toHaveCount(2);
  await expect(history(page).first()).toContainText("Entrevista");
  await expect(history(page).first()).toContainText("LinkedIn");
  await expect(history(page).first()).toContainText("Entrevista técnica con Laura el jueves");

  const stored = await readProcess(request, vacancy);
  expect(stored.status).toBe("interview");
  expect(stored.contacts.map((c) => c.name)).toEqual(["Laura Gómez"]);
});

test("#82: descartar pide el motivo y lo muestra en el estado y en el historial", async ({
  page,
  request,
}) => {
  const vacancy = await createVacancy(request);
  await openProcess(page, vacancy);

  await page.getByRole("button", { name: "Mover a…" }).click();
  const dialog = page.getByRole("dialog", { name: "Mover la vacante" });
  await dialog.getByLabel("Nuevo estado").selectOption("discarded");
  await expect(dialog.getByRole("button", { name: "Mover", exact: true })).toBeDisabled();
  await dialog.getByLabel("Motivo del descarte").selectOption("withdrawn");
  await dialog.getByLabel("Nota (opcional)").fill("El salario no encaja");
  await dialog.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(status(page)).toContainText("Descartada (me retiré)");
  await expect(history(page).first()).toContainText("El salario no encaja");
  const stored = await readProcess(request, vacancy);
  expect(stored).toMatchObject({ status: "discarded", discardReason: "withdrawn" });
});
