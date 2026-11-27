import type { CvMeta, EmailDraft, GmailConnectStart, GmailStatus, Vacancy } from "@apply/shared";
import { type APIRequestContext, expect, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

/** El Google falso aprueba solo: seguir la URL de consentimiento deja el token en el loopback. */
async function ensureGmailConnected(request: APIRequestContext) {
  const status = (await (await request.get(`${API}/gmail/status`)).json()) as GmailStatus;
  if (status.state === "connected") return;
  const start = (await (await request.post(`${API}/gmail/connect`)).json()) as GmailConnectStart;
  expect((await request.get(start.authUrl)).ok()).toBe(true);
  await expect
    .poll(
      async () => ((await (await request.get(`${API}/gmail/status`)).json()) as GmailStatus).state,
    )
    .toBe("connected");
}

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
  const index = cvs.findIndex((c) => c.vacancyId === vacancy.id);
  const cv = cvs[index];
  expect(cv).toBeDefined();
  const draft = (await (
    await request.post(`${API}/cvs/${cv?.id}/email-draft`, { data: {} })
  ).json()) as EmailDraft;

  await page.goto("/");
  await page.getByRole("tab", { name: /CVs/ }).click();
  await page.getByRole("button", { name: cv?.title }).nth(index).click();
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

  await page.getByRole("tab", { name: /Postulaciones/ }).click();
  const item = page.locator('[data-id="applications-list"] li', { hasText: vacancy.title });
  await expect(item.first()).toContainText("Postulada");
});
