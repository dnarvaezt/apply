import type { TrackingMetrics, Vacancy } from "@apply/shared";
import { expect, type Page, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;

const LABELS: Record<Exclude<keyof TrackingMetrics, "contactOrigin">, string> = {
  applications: "Postulaciones",
  companiesContacted: "Empresas que contactaron",
  activeProcesses: "Procesos activos",
  classified: "Clasificadas",
  open: "Abiertas",
  closed: "Cerradas",
};

const metric = (page: Page, label: string) =>
  page.locator('[data-id="metrics-view__metric"]').filter({
    has: page.getByText(label, { exact: true }),
  });

async function expectMetrics(page: Page, expected: TrackingMetrics) {
  for (const [key, label] of Object.entries(LABELS)) {
    await expect(metric(page, label).locator('[data-id="metrics-view__value"]')).toHaveText(
      String(expected[key as keyof typeof LABELS]),
    );
  }
}

// Corre en el proyecto `applications`: la base ya tiene las postulaciones de sus otros specs, así
// que los valores esperados salen de la propia API y luego se comprueba el incremento.
test("AC-006 (#23): la pestaña de métricas muestra los valores y se actualiza tras un evento manual", async ({
  page,
  request,
}) => {
  const vacancy = (await (
    await request.post(`${API}/vacancies`, {
      data: {
        text: "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.",
      },
    })
  ).json()) as Vacancy;
  const created = await request.post(`${API}/applications`, { data: { vacancyId: vacancy.id } });
  expect(created.status()).toBe(201);

  const before = (await (await request.get(`${API}/metrics`)).json()) as TrackingMetrics;
  expect(before.applications).toBeGreaterThan(0);

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Métricas/ })
    .click();
  await expectMetrics(page, before);

  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Postulaciones/ })
    .click();
  await page.locator('[data-id="applications-list"] li').first().click();
  const eventForm = page.locator('[data-id="event-form"]');
  await eventForm.getByLabel("Tipo").selectOption("interview");
  await eventForm.getByLabel("Canal").selectOption("whatsapp");
  await eventForm.getByRole("button", { name: "Registrar evento" }).click();
  await expect(page.getByText("Evento registrado")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Secciones" })
    .getByRole("link", { name: /Métricas/ })
    .click();
  await expectMetrics(page, {
    ...before,
    activeProcesses: before.activeProcesses + 1,
    classified: before.classified + 1,
  });
  const after = (await (await request.get(`${API}/metrics`)).json()) as TrackingMetrics;
  expect(after.contactOrigin).toContainEqual({
    channel: "whatsapp",
    count: (before.contactOrigin.find((o) => o.channel === "whatsapp")?.count ?? 0) + 1,
  });
  await expect(page.locator('[data-id="metrics-view__origin"]')).toContainText("WhatsApp");
});
