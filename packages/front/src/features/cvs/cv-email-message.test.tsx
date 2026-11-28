// @vitest-environment happy-dom
import type { EmailDraft } from "@apply/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CvEmailMessage } from "./cv-email-message";

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

function stubClipboard() {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  return writeText;
}

describe("CvEmailMessage (#76)", () => {
  it("sin mensaje ofrece generarlo con IA y muestra asunto y cuerpo generados", async () => {
    const fetchMock = serve(reply(null), reply(DRAFT, 201));
    render(<CvEmailMessage cvId="c1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Generar mensaje de correo" }));

    expect(await screen.findByText("Postulación Backend")).toBeTruthy();
    expect(screen.getByText(/Me postulo\./)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/cvs\/c1\/email-draft$/);
    expect(init.method).toBe("POST");
  });

  it("muestra el mensaje ya generado y copia el asunto y el cuerpo", async () => {
    serve(reply(DRAFT));
    const writeText = stubClipboard();
    render(<CvEmailMessage cvId="c1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Copiar asunto" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensaje" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText).toHaveBeenNthCalledWith(1, DRAFT.subject);
    expect(writeText).toHaveBeenNthCalledWith(2, DRAFT.body);
    expect(screen.getByRole("button", { name: "Regenerar mensaje" })).toBeTruthy();
  });

  it("un error de la IA se muestra y no deja un mensaje vacío", async () => {
    serve(reply(null), reply({ error: "Claude no respondió" }, 502));
    render(<CvEmailMessage cvId="c1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Generar mensaje de correo" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Claude no respondió"),
    );
    expect(screen.queryByRole("button", { name: "Copiar mensaje" })).toBeNull();
  });
});
