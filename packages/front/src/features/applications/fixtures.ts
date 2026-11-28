import type { ApplicationContact, Channel } from "@apply/shared";

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
