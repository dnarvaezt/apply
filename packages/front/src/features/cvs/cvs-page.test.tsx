// @vitest-environment happy-dom
import type { CvDoc } from "@apply/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelectRoute } from "@/lib/route-selection";
import { CvsPage } from "./cvs-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CV: CvDoc = {
  id: "c1",
  vacancyId: null,
  title: "CV Backend",
  markdown: "# Ana Pérez\n\nTexto original",
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** La frontera es HTTP: el servidor falso responde según método y ruta. */
function serve() {
  const saved: { markdown: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PUT" && url.endsWith("/cvs/c1")) {
      const body = JSON.parse(String(init.body)) as { markdown: string; title: string };
      saved.push(body);
      return reply({ ...CV, ...body });
    }
    if (url.endsWith("/cvs")) return reply([CV]);
    if (url.endsWith("/cvs/c1")) return reply(CV);
    if (url.endsWith("/match")) return reply({ error: "sin informe" }, 404);
    return reply(null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return saved;
}

/** Sustituye a la URL: guarda el CV abierto como lo haría la ruta `/cvs/[id]`. */
function CvsAt({ onSelect }: { onSelect?: SelectRoute }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <CvsPage
      selectedId={selectedId}
      onSelect={(id, options) => {
        onSelect?.(id, options);
        setSelectedId(id);
      }}
    />
  );
}

const editTab = () => screen.findByRole("tab", { name: "Editar" });
const previewTab = () => screen.findByRole("tab", { name: "Vista previa" });
const editor = () => screen.getByRole("textbox", { name: "Markdown del CV" });
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } });

describe("CvsPage: alternar editar / vista previa", () => {
  it("al abrir un CV muestra el Markdown renderizado y no el textarea (REQ-001, REQ-002)", async () => {
    serve();
    render(<CvsAt />);

    expect(await screen.findByRole("heading", { name: "Ana Pérez" })).toBeTruthy();
    expect((await previewTab()).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("textbox", { name: "Markdown del CV" })).toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Editar",
      "Vista previa",
    ]);
  });

  it("los cambios de Editar se ven en Vista previa sin guardar y no se pierden al volver (REQ-003)", async () => {
    serve();
    render(<CvsAt />);
    fireEvent.click(await editTab());
    type("# Ana Pérez\n\nTexto modificado");

    fireEvent.click(await previewTab());
    await waitFor(() => expect(screen.getByText("Texto modificado")).toBeTruthy());
    expect(screen.queryByRole("textbox", { name: "Markdown del CV" })).toBeNull();

    fireEvent.click(await editTab());
    expect((editor() as HTMLTextAreaElement).value).toBe("# Ana Pérez\n\nTexto modificado");
  });

  it("conserva sin guardar al alternar y Guardar envía el Markdown editado desde ambos modos (REQ-003, REQ-004)", async () => {
    const saved = serve();
    render(<CvsAt />);
    fireEvent.click(await editTab());
    type("# Ana Pérez\n\nPrimera edición");
    expect(screen.getByText("sin guardar")).toBeTruthy();

    fireEvent.click(await previewTab());
    expect(screen.getByText("sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.markdown).toBe("# Ana Pérez\n\nPrimera edición");
    await waitFor(() => expect(screen.queryByText("sin guardar")).toBeNull());

    fireEvent.click(await editTab());
    type("# Ana Pérez\n\nSegunda edición");
    expect(screen.getByText("sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]?.markdown).toBe("# Ana Pérez\n\nSegunda edición");
  });

  it("el switch expone tablist y las flechas mueven el foco entre pestañas (REQ-005)", async () => {
    serve();
    render(<CvsAt />);
    const preview = await previewTab();

    expect(screen.getByRole("tablist")).toBeTruthy();
    preview.focus();
    fireEvent.keyDown(preview, { key: "ArrowLeft" });
    const edit = await editTab();
    await waitFor(() => expect(document.activeElement).toBe(edit));
    // La activación con Enter/Espacio la resuelve el navegador: la cubre el e2e (AC-004).
  });
});

describe("CvsPage: CV abierto según la URL", () => {
  it("sin CV en la URL muestra el primero sin navegar", async () => {
    // Navegar al cargar la lista pisaba la navegación que el usuario ya había empezado.
    serve();
    const onSelect = vi.fn<SelectRoute>();
    render(<CvsAt onSelect={onSelect} />);

    expect(await screen.findByDisplayValue("CV Backend")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("con un CV en la URL lo abre sin navegar", async () => {
    serve();
    const onSelect = vi.fn<SelectRoute>();
    render(<CvsPage selectedId="c1" onSelect={onSelect} />);

    expect(await screen.findByDisplayValue("CV Backend")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
