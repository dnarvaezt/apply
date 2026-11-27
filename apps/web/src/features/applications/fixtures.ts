import type { Application, ApplicationEvent } from "@apply/shared";

export function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "1",
    vacancyId: "10",
    cvId: null,
    status: "applied",
    active: true,
    classifiedAt: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

export function event(overrides: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return {
    id: "1",
    applicationId: "1",
    type: "applied",
    occurredAt: "2026-11-01T10:00:00.000Z",
    channel: null,
    source: "manual",
    notes: null,
    gmailMessageId: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}
