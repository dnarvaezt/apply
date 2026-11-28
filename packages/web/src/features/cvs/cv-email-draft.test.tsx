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
  to: null,
  subject: "Postulación Backend",
  body: "Hola Laura,\n\nMe postulo.",
  language: "es",
  status: "draft",
  sentAt: null,
  applicationId: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** La frontera es HTTP: cada respuesta se entrega en el orden de las peticiones. */
function serve(...responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift() ?? reply({ error: "sin respuesta" }, 500));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const generateButton = () => screen.findByRole("button", { name: "Generar correo" });

describe("CvEmailDraft (REQ-006)", () => {
  it("sin borrador ofrece generarlo y muestra el borrador generado", async () => {
    const fetchMock = serve(reply(null), reply(DRAFT, 201));
    render(<CvEmailDraft cvId="c1" />);
    expect(await screen.findByText("Aún no hay correo para este CV.")).toBeTruthy();
    fireEvent.click(await generateButton());
    expect(((await screen.findByLabelText("Asunto")) as HTMLInputElement).value).toBe(
      "Postulación Backend",
    );
    expect(screen.getByText(/Falta el destinatario/)).toBeTruthy();
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls.map(([u, i]) => `${i?.method ?? "GET"} ${u}`)).toEqual([
      "GET /api/cvs/c1/email-draft",
      "POST /api/cvs/c1/email-draft",
    ]);
  });

  it("un error del LLM se muestra y no deja un borrador vacío", async () => {
    serve(reply(null), reply({ error: "El modelo rechazó redactar el correo." }, 500));
    render(<CvEmailDraft cvId="c1" />);
    fireEvent.click(await generateButton());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "El modelo rechazó redactar el correo.",
    );
    expect(screen.queryByLabelText("Asunto")).toBeNull();
    expect(screen.getByText("Aún no hay correo para este CV.")).toBeTruthy();
  });

  it("guarda los cambios y muestra el error del servidor junto al formulario", async () => {
    const saved = { ...DRAFT, subject: "Editado", updatedAt: "2026-11-27T11:00:00.000Z" };
    const fetchMock = serve(
      reply(DRAFT),
      reply({ error: "to: Invalid email address" }, 400),
      reply(saved),
    );
    render(<CvEmailDraft cvId="c1" />);
    fireEvent.change(await screen.findByLabelText("Asunto"), { target: { value: "Editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid email address");
    expect((screen.getByLabelText("Asunto") as HTMLInputElement).value).toBe("Editado");

    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(await screen.findByText("Borrador guardado")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("sin guardar")).toBeNull();
    const [, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({ to: "", subject: "Editado", body: "Hola Laura,\n\nMe postulo." }),
    );
  });

  it("regenerar pide confirmación porque reemplaza el borrador", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const fetchMock = serve(reply(DRAFT));
    render(<CvEmailDraft cvId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Regenerar" }));
    expect(confirm).toHaveBeenCalledWith(
      "Regenerar reemplaza el asunto y el cuerpo actuales. ¿Regenerar?",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si la carga falla lo dice y deja reintentar", async () => {
    serve(reply({ error: "Base caída" }, 500), reply(DRAFT));
    render(<CvEmailDraft cvId="c1" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Base caída");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText("Asunto")).toBeTruthy();
  });
});
