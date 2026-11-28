// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactsPanel } from "./contacts-panel";
import { contact } from "./fixtures.ts";

afterEach(cleanup);

const contacts = [
  contact({ id: "1", name: "Laura Gómez", title: "Recruiter", isProcessStart: true }),
  contact({ id: "2", name: "Ana", profileUrl: "https://www.linkedin.com/in/ana" }),
];

function renderPanel(overrides: Partial<Parameters<typeof ContactsPanel>[0]> = {}) {
  const props = {
    contacts,
    onAdd: vi.fn(async () => true),
    onUpdate: vi.fn(async () => true),
    onMarkProcessStart: vi.fn(async () => {}),
    ...overrides,
  };
  render(<ContactsPanel {...props} />);
  return props;
}

describe("ContactsPanel (REQ-002, REQ-005)", () => {
  it("lista los contactos y señala el que inició el proceso", () => {
    renderPanel();
    const [laura, ana] = screen.getAllByRole("listitem");
    expect(within(laura).getByText("Laura Gómez")).toBeTruthy();
    expect(within(laura).getByText("Recruiter")).toBeTruthy();
    expect(within(laura).getByText("Inicio del proceso")).toBeTruthy();
    expect(within(ana).queryByText("Inicio del proceso")).toBeNull();
    expect(within(ana).getByRole("link", { name: "Perfil de Ana" }).getAttribute("href")).toBe(
      "https://www.linkedin.com/in/ana",
    );
  });

  it("sin contactos lo dice", () => {
    renderPanel({ contacts: [] });
    expect(screen.getByText("Sin contactos todavía.")).toBeTruthy();
  });

  it("marca y desmarca el inicio de proceso", () => {
    const { onMarkProcessStart } = renderPanel();
    const [laura, ana] = screen.getAllByRole("listitem");
    fireEvent.click(within(laura).getByRole("button", { name: "Quitar inicio de Laura Gómez" }));
    expect(onMarkProcessStart).toHaveBeenCalledWith("1", false);
    fireEvent.click(within(ana).getByRole("button", { name: "Marcar inicio con Ana" }));
    expect(onMarkProcessStart).toHaveBeenCalledWith("2", true);
  });

  it("edita un contacto y cierra el formulario al guardar", async () => {
    const { onUpdate } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Editar Ana" }));
    fireEvent.change(screen.getByLabelText("Cargo"), { target: { value: "CTO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contacto" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "2",
      expect.objectContaining({ name: "Ana", title: "CTO" }),
    );
    await screen.findByRole("button", { name: "Agregar contacto" });
    expect(screen.queryByRole("button", { name: "Guardar contacto" })).toBeNull();
  });

  it("agrega un contacto desde el formulario", async () => {
    const { onAdd } = renderPanel({ contacts: [] });
    fireEvent.click(screen.getByRole("button", { name: "Agregar contacto" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Pedro" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar contacto" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pedro", isProcessStart: false }),
    );
    await screen.findByRole("button", { name: "Agregar contacto" });
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });
});
