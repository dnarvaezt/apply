import type { CvMeta, EmailDraft, Vacancy } from "@apply/shared";
import { expect, test } from "@playwright/test";
import { API, ensureGmailConnected } from "./support/gmail.ts";
import { openDetailTab } from "./support/vacancy-ui.ts";

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

// AC-008 (#21): con Gmail conectado al Google falso, el correo de un CV se revisa en la vista
// previa, se confirma, se envía y queda la postulación registrada. Crea una postulación, así que
// corre en el proyecto `applications`, después de los specs que esperan la base sin postulaciones.
test("AC-008 (#21): vista previa, confirmación y envío con Gmail registran la postulación", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await ensureGmailConnected(request);

  const vacancy = (await (
    await request.post(`${API}/vacancies`, { data: { text: VACANCY_TEXT } })
  ).json()) as Vacancy;
  const generated = await request.post(`${API}/cvs/generate`, {
    data: { vacancyId: vacancy.id, instructions: "" },
    timeout: 180_000,
  });
  expect(await generated.text()).toContain("event: done");
  const cvs = (await (await request.get(`${API}/cvs`)).json()) as CvMeta[];
  const cv = cvs.find((c) => c.vacancyId === vacancy.id);
  expect(cv).toBeDefined();
  const draft = (await (
    await request.post(`${API}/cvs/${cv?.id}/email-draft`, { data: {} })
  ).json()) as EmailDraft;

  // `/cvs/[id]` lleva al tab CV del detalle de su vacante con ese CV abierto (#73).
  await page.goto(`/cvs/${cv?.id}`);
  await expect(page).toHaveURL(new RegExp(`/vacancies/${vacancy.id}\\?tab=cv&cv=${cv?.id}$`));
  const panel = page.locator('[data-id="cv-email-draft"]');
  await expect(panel.getByLabel("Asunto")).toHaveValue(draft.subject);

  // La vacante falsa no publica email: sin destinatario no se ofrece enviar.
  await expect(panel.getByText(/registra la postulación a mano/)).toBeVisible();
  await panel.getByLabel("Para").fill("talento@example.com");
  await panel.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(panel.getByText("Borrador guardado")).toBeVisible();

  await panel.getByRole("button", { name: "Vista previa del envío" }).click();
  const preview = panel.getByRole("region", { name: "Vista previa del envío" });
  await expect(preview).toContainText("talento@example.com");
  await expect(preview).toContainText(draft.subject);
  await expect(preview.getByTitle("PDF adjunto")).toHaveAttribute(
    "src",
    `/api/cvs/${cv?.id}/pdf?inline=1`,
  );
  const send = preview.getByRole("button", { name: "Enviar con Gmail" });
  await expect(send).toBeDisabled();
  await preview.getByLabel("Revisé asunto, cuerpo y PDF").check();
  await send.click();

  await expect(panel.getByRole("status")).toContainText("Enviado el", { timeout: 60_000 });
  await expect(panel.getByLabel("Asunto")).toHaveCount(0);

  const sent = (await (await request.get(`${API}/cvs/${cv?.id}/email-draft`)).json()) as EmailDraft;
  expect(sent).toMatchObject({ status: "sent", to: "talento@example.com" });
  expect(sent.applicationId).not.toBeNull();

  // El envío registró la postulación: el panel de la vacante la muestra al recargar.
  await page.reload();
  await openDetailTab(page, "Línea de tiempo");
  await expect(page.locator('[data-id="status-stepper"]')).toContainText("Postulada");
});
