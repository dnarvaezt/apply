import type { CvMeta, EmailDraft, GmailSyncResult, Vacancy } from "@apply/shared";
import { expect, test } from "@playwright/test";
import { API, ensureGmailConnected, FAKE_GOOGLE } from "./support/gmail.ts";

const VACANCY_TEXT =
  "Buscamos ingeniero de plataforma con Node.js y Kubernetes para automatizar despliegues, mantener la observabilidad y acompañar a los equipos de producto. Híbrido en Bogotá.";
const RECRUITER = "seleccion.plataforma@example.com";

// AC-007 (#22): con Gmail mockeado, una respuesta en el hilo de un correo enviado aparece tras
// sincronizar como evento automático, y la vista declara la cobertura de la detección. Crea una
// postulación, así que corre en el proyecto `applications`.
test("AC-007 (#22): la respuesta detectada aparece como evento automático con el aviso de cobertura", async ({
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
  const saved = await request.put(`${API}/email-drafts/${draft.id}`, {
    data: { to: RECRUITER, subject: draft.subject, body: draft.body },
  });
  expect(saved.ok()).toBe(true);
  const sent = await request.post(`${API}/email-drafts/${draft.id}/send`, {
    data: { confirmed: true },
  });
  expect(((await sent.json()) as EmailDraft).status).toBe("sent");

  const reply = await request.post(`${FAKE_GOOGLE}/__fake/reply`, {
    data: { from: `Selección <${RECRUITER}>` },
  });
  expect(reply.status()).toBe(201);
  const result = (await (await request.post(`${API}/gmail/sync`)).json()) as GmailSyncResult;
  expect(result).toMatchObject({ state: "synced", recorded: 1 });

  await page.goto(`/vacancies/${vacancy.id}?tab=application`);
  const events = page.locator('[data-id="application-timeline__event"]', {
    hasText: "Contactada",
  });
  await expect(events).toHaveCount(1);
  await expect(events).toContainText("automático");

  const notice = page.locator('[data-id="reply-sync-notice"]');
  await expect(notice).toContainText("contactos con email conocido");
  await expect(notice).toContainText("LinkedIn, ATS o teléfono se registra a mano");
  await expect(notice.locator('[data-id="reply-sync-notice__last-sync"] time')).toHaveAttribute(
    "dateTime",
    result.state === "synced" ? result.lastSyncedAt : "",
  );
});
