// @vitest-environment happy-dom
import type { IndexStatus, ProfileFile } from "@apply/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "./profile-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FILES: ProfileFile[] = [
  { name: "00-datos.md", content: "# Datos", updatedAt: "2026-11-27T10:00:00.000Z" },
  { name: "10-experiencia.md", content: "# Experiencia", updatedAt: "2026-11-27T10:00:00.000Z" },
];
const STATUS: IndexStatus = { builtAt: null, files: 0, chunks: 0, stale: false, model: "m" };

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

/** La frontera es HTTP: el servidor falso sirve la lista y registra los borrados. */
function serve() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") return reply({ ok: true });
    if (url.endsWith("/index/status")) return reply(STATUS);
    return reply(FILES);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  const deletes = () =>
    fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
  return { deletes };
}

const editor = () => document.querySelector("textarea") as HTMLTextAreaElement;

async function renderPage() {
  const onSelect = vi.fn();
  render(<ProfilePage selectedId="00-datos.md" onSelect={onSelect} />);
  await waitFor(() => expect(editor().value).toBe("# Datos"));
  return onSelect;
}

describe("ProfilePage: confirmaciones con AlertDialog (#79)", () => {
  it("Eliminar pide confirmación nombrando el archivo y borra solo al confirmar", async () => {
    const { deletes } = serve();
    const onSelect = await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("00-datos.md");
    expect(deletes()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar archivo" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
    expect(deletes()).toHaveLength(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("con cambios sin guardar, abrir otro archivo pide descartarlos; Cancelar se queda", async () => {
    serve();
    const onSelect = await renderPage();
    fireEvent.change(editor(), { target: { value: "# Datos editados" } });

    fireEvent.click(screen.getByRole("button", { name: "10-experiencia.md" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("sin guardar");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "10-experiencia.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar cambios" }));
    expect(onSelect).toHaveBeenCalledWith("10-experiencia.md");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("sin cambios, abrir otro archivo no pregunta", async () => {
    serve();
    const onSelect = await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "10-experiencia.md" }));
    expect(onSelect).toHaveBeenCalledWith("10-experiencia.md");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
