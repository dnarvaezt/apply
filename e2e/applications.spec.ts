import type { AddEventResult, Application, ApplicationTimeline, Vacancy } from "@apply/shared";
import { expect, test } from "@playwright/test";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api`;

const VACANCY_TEXT =
  "Buscamos ingeniera backend senior con TypeScript y PostgreSQL para diseñar servicios, revisar código y operar APIs en producción. Trabajo remoto.";

test("AC-008: crear postulación, agregar interview y rejected, y leer la línea de tiempo cerrada", async ({
  request,
}) => {
  const vacancyRes = await request.post(`${API}/vacancies`, { data: { text: VACANCY_TEXT } });
  expect(vacancyRes.ok()).toBe(true);
  const vacancy = (await vacancyRes.json()) as Vacancy;

  const createRes = await request.post(`${API}/applications`, {
    data: { vacancyId: vacancy.id, channel: "email", appliedAt: "2026-11-01T10:00:00.000Z" },
  });
  expect(createRes.status()).toBe(201);
  const application = (await createRes.json()) as Application;
  expect(application).toMatchObject({ status: "applied", active: true, classifiedAt: null });

  const interview = await request.post(`${API}/applications/${application.id}/events`, {
    data: { type: "interview", source: "manual", occurredAt: "2026-11-05T10:00:00.000Z" },
  });
  expect(interview.status()).toBe(201);
  expect(((await interview.json()) as AddEventResult).application.status).toBe("interview");

  const rejected = await request.post(`${API}/applications/${application.id}/events`, {
    data: { type: "rejected", source: "manual", occurredAt: "2026-11-09T10:00:00.000Z" },
  });
  expect(rejected.status()).toBe(201);

  const timelineRes = await request.get(`${API}/applications/${application.id}`);
  expect(timelineRes.ok()).toBe(true);
  const timeline = (await timelineRes.json()) as ApplicationTimeline;
  expect(timeline.events.map((e) => [e.type, e.occurredAt])).toEqual([
    ["applied", "2026-11-01T10:00:00.000Z"],
    ["interview", "2026-11-05T10:00:00.000Z"],
    ["rejected", "2026-11-09T10:00:00.000Z"],
  ]);
  expect(timeline.application).toMatchObject({
    status: "rejected",
    active: false,
    classifiedAt: "2026-11-05T10:00:00.000Z",
  });
});
