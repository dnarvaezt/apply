// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { vacancy } from "./fixtures";
import { VacancyEditPage } from "./vacancy-edit-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function serve() {
  const patches: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        patches.push(body);
        return reply(vacancy(body));
      }
      return reply(vacancy());
    }),
  );
  return patches;
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe("VacancyEditPage (#73)", () => {
  it("precarga la vacante y guarda título, empresa y ubicación corregidos", async () => {
    const patches = serve();
    const onSaved = vi.fn();
    render(<VacancyEditPage id="10" onSaved={onSaved} />);

    expect((await screen.findByLabelText("Título")).getAttribute("value")).toBe(
      "Ingeniera Backend",
    );
    fireEvent.change(field("Título"), { target: { value: "  Staff Backend " } });
    fireEvent.change(field("Empresa"), { target: { value: "Nequi" } });
    fireEvent.change(field("Ubicación"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(patches[0]).toMatchObject({ title: "Staff Backend", company: "Nequi", location: null });
  });

  it("no deja guardar sin título", async () => {
    serve();
    render(<VacancyEditPage id="10" onSaved={() => undefined} />);
    await screen.findByLabelText("Título");

    fireEvent.change(field("Título"), { target: { value: " " } });
    expect(screen.getByText("Título y empresa son obligatorios.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
