import type { Application, ApplicationContact, ApplicationEvent, Channel } from "@apply/shared";

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
    contactId: null,
    notes: null,
    gmailMessageId: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

export const CHANNELS: Channel[] = [
  { slug: "ats", name: "ATS" },
  { slug: "email", name: "Correo" },
  { slug: "linkedin", name: "LinkedIn" },
];

export function contact(overrides: Partial<ApplicationContact> = {}): ApplicationContact {
  return {
    id: "1",
    name: "Laura Gómez",
    title: null,
    email: null,
    phone: null,
    profileUrl: null,
    notes: null,
    company: "ACME",
    createdAt: "2026-11-01T10:00:00.000Z",
    isProcessStart: false,
    ...overrides,
  };
}
