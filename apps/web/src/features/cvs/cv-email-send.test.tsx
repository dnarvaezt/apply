// @vitest-environment happy-dom
import type { EmailDraft } from "@apply/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CvEmailDraft } from "./cv-email-draft";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT: EmailDraft = {
  id: "e1",
  cvId: "c1",
  to: "laura@example.com",
  subject: "Postulación Backend",
  body: "Hola Laura,\n\nMe postulo.",
  language: "es",
  status: "draft",
  sentAt: null,
  applicationId: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};
const SENT: EmailDraft = {
  ...DRAFT,
  status: "sent",
  sentAt: "2026-11-27T12:30:00.000Z",
  applicationId: "a1",
};
const SENDING: EmailDraft = { ...DRAFT, status: "sending" };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** La frontera es HTTP: cada respuesta se entrega en el orden de las peticiones. */
function serve(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? reply({ error: "sin respuesta" }, 500));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requests = (fetchMock: ReturnType<typeof serve>) =>
  (fetchMock.mock.calls as unknown as [string, RequestInit | undefined][]).map(
    ([u, i]) => `${i?.method ?? "GET"} ${u}`,
  );

const sendButton = () =>
  screen.getByRole("button", { name: "Enviar con Gmail" }) as HTMLButtonElement;
const reviewed = () => screen.getByRole("checkbox", { name: /Revisé asunto, cuerpo y PDF/ });

async function openPreview() {
  fireEvent.click(await screen.findByRole("button", { name: "Vista previa del envío" }));
}

describe("CvEmailDraft: envío con Gmail (#21)", () => {
  it("AC-002: la vista previa muestra lo que se envía y exige confirmar antes de enviar", async () => {
    const fetchMock = serve(reply(DRAFT), reply(SENT));
    render(<CvEmailDraft cvId="c1" />);
    await openPreview();

    const preview = screen.getByRole("region", { name: "Vista previa del envío" });
    expect(preview.textContent).toContain("laura@example.com");
    expect(preview.textContent).toContain("Postulación Backend");
    expect(preview.textContent).toContain("Me postulo.");
    const pdf = screen.getByTitle("PDF adjunto") as HTMLIFrameElement;
    expect(pdf.getAttribute("src")).toBe("/api/cvs/c1/pdf?inline=1");

    expect(sendButton().disabled).toBe(true);
    fireEvent.click(reviewed());
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());

    expect((await screen.findByRole("status")).textContent).toMatch(/Enviado el/);
    expect(screen.queryByLabelText("Asunto")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar con Gmail" })).toBeNull();
    expect(requests(fetchMock)).toEqual([
      "GET /api/cvs/c1/email-draft",
      "POST /api/email-drafts/e1/send",
    ]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls[1][1]?.body).toBe(JSON.stringify({ confirmed: true }));
  });

  it("AC-003: sin destinatario no ofrece enviar y dice que la postulación se registra a mano", async () => {
    const fetchMock = serve(reply({ ...DRAFT, to: null }));
    render(<CvEmailDraft cvId="c1" />);
    expect(await screen.findByText(/registra la postulación a mano/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Vista previa del envío" })).toBeNull();
    expect(requests(fetchMock)).toEqual(["GET /api/cvs/c1/email-draft"]);
  });

  it("con cambios sin guardar no deja enviar: lo enviado es lo guardado", async () => {
    serve(reply(DRAFT));
    render(<CvEmailDraft cvId="c1" />);
    await openPreview();
    fireEvent.click(reviewed());
    fireEvent.change(screen.getByLabelText("Asunto"), { target: { value: "Otro asunto" } });
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText("Guarda los cambios antes de enviar.")).toBeTruthy();
  });

  it("un error de Gmail se muestra y recarga el estado real del correo", async () => {
    const error = "Gmail pide volver a conectar la cuenta (reauth).";
    const fetchMock = serve(reply(DRAFT), reply({ error }, 409), reply(DRAFT));
    render(<CvEmailDraft cvId="c1" />);
    await openPreview();
    fireEvent.click(reviewed());
    fireEvent.click(sendButton());
    expect((await screen.findByRole("alert")).textContent).toContain(error);
    expect(await screen.findByLabelText("Asunto")).toBeTruthy();
    expect(requests(fetchMock)).toEqual([
      "GET /api/cvs/c1/email-draft",
      "POST /api/email-drafts/e1/send",
      "GET /api/cvs/c1/email-draft",
    ]);
  });

  it("AC-005: un envío sin confirmar pide verificar y deja al usuario decidir si salió", async () => {
    const fetchMock = serve(reply(DRAFT), reply(SENDING, 202), reply(SENDING, 202), reply(SENT));
    render(<CvEmailDraft cvId="c1" />);
    await openPreview();
    fireEvent.click(reviewed());
    fireEvent.click(sendButton());

    expect(await screen.findByText(/No se pudo confirmar si Gmail envió el correo/)).toBeTruthy();
    expect(screen.queryByLabelText("Asunto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verificar de nuevo" }));
    expect(await screen.findByText(/No se pudo confirmar/)).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Sí se envió" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/Enviado el/);

    expect(requests(fetchMock)).toEqual([
      "GET /api/cvs/c1/email-draft",
      "POST /api/email-drafts/e1/send",
      "POST /api/email-drafts/e1/send",
      "POST /api/email-drafts/e1/resolve",
    ]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls[3][1]?.body).toBe(JSON.stringify({ sent: true }));
  });

  it("AC-005: si no salió, el correo queda fallido y se puede reintentar con la vista previa", async () => {
    const failed = { ...DRAFT, status: "failed" as const };
    const fetchMock = serve(reply(SENDING), reply(failed));
    render(<CvEmailDraft cvId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "No se envió" }));
    expect(await screen.findByText(/El último envío falló/)).toBeTruthy();
    // Fallido se puede corregir (p. ej. el destinatario que Gmail rechazó) antes de reintentar.
    expect(screen.getByLabelText("Asunto")).toBeTruthy();
    await openPreview();
    expect(sendButton().disabled).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls[1][1]?.body).toBe(JSON.stringify({ sent: false }));
  });

  it("un correo ya enviado no ofrece regenerar ni editar", async () => {
    serve(reply(SENT));
    render(<CvEmailDraft cvId="c1" />);
    expect((await screen.findByRole("status")).textContent).toMatch(/Enviado el/);
    expect(screen.queryByRole("button", { name: /Regenerar/ })).toBeNull();
    expect(screen.queryByLabelText("Asunto")).toBeNull();
  });
});
