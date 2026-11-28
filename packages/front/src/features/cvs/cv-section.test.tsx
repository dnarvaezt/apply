// @vitest-environment happy-dom
import type { CvDoc } from "@apply/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CvSection } from "./cv-section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CV: CvDoc = {
  id: "c1",
  vacancyId: "v1",
  title: "CV Backend",
  markdown: "# Ana Pérez\n\nTexto original",
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function serve() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/cvs/c1")) return reply(CV);
    return reply(null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noop = () => undefined;
const section = (cv: CvDoc | null) => (
  <CvSection
    vacancyId="v1"
    cv={cv}
    onMatch={noop}
    onGenerated={noop}
    onSaved={noop}
    onDeleted={noop}
  />
);

describe("CvSection: un único CV por vacante (#76)", () => {
  it("sin CV ofrece generarlo y no ofrece regenerar", async () => {
    serve();
    render(section(null));

    expect(screen.getByText("Aún no hay un CV para esta vacante")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generar CV para esta vacante/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Regenerar con IA/ })).toBeNull();
  });

  it("con CV muestra el editor y el mensaje de correo, sin versiones, cobertura ni tarjeta de correo", async () => {
    serve();
    render(section(CV));

    expect(await screen.findByRole("tab", { name: "Vista previa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PDF" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Generar mensaje de correo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nuevo CV/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Versiones del CV" })).toBeNull();
    expect(screen.queryByText("Cobertura frente a la vacante")).toBeNull();
    expect(screen.queryByText("Correo de postulación")).toBeNull();
  });

  it("regenerar con IA pide confirmación en un diálogo y, si se cancela, no genera", async () => {
    const fetchMock = serve();
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    render(section(CV));

    fireEvent.click(screen.getByRole("button", { name: /Regenerar con IA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerar CV" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("elimina el CV actual");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cvs/generate"))).toBe(false);
  });

  it("al regenerar oculta el CV actual mientras se genera el nuevo; Detener lo conserva", async () => {
    const base = serve();
    // El generador queda abierto hasta que se aborta, como un stream SSE en curso.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith("/cvs/generate")) return base(input);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: delta\ndata: "# Nuevo"\n\n'));
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Detenido", "AbortError")),
            );
          },
        });
        return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );
    const { container } = render(section(CV));
    await screen.findByRole("tab", { name: "Vista previa" });

    fireEvent.click(screen.getByRole("button", { name: /Regenerar con IA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerar CV" }));
    fireEvent.click(await screen.findByRole("button", { name: "Regenerar" }));
    await screen.findByRole("button", { name: /Detener/ });
    await waitFor(() => expect(container.querySelector('[data-id="cv-editor"]')).toBeNull());
    expect(container.querySelector('[data-id="cv-email-message"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Detener/ }));
    expect(await screen.findByRole("tab", { name: "Vista previa" })).toBeTruthy();
    expect(container.querySelector('[data-id="cv-editor"]')).not.toBeNull();
  });
});
