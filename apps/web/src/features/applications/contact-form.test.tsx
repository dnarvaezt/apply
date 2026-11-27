// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "./contact-form";
import { contact } from "./fixtures.ts";

afterEach(cleanup);

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ContactForm (REQ-002)", () => {
  it("crea un contacto con todos sus campos y la marca de inicio de proceso", () => {
    const onSubmit = vi.fn(async () => true);
    render(<ContactForm submitLabel="Agregar contacto" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Agregar contacto" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fill("Nombre", " Laura Gómez ");
    fill("Cargo", "Talent Partner");
    fill("Email", "laura@example.com");
    fill("Teléfono", "+57 300");
    fill("LinkedIn", "https://www.linkedin.com/in/laura");
    fill("Notas", "Escribió primero");
    fireEvent.click(screen.getByLabelText("Inició el proceso"));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Laura Gómez",
      title: "Talent Partner",
      email: "laura@example.com",
      phone: "+57 300",
      profileUrl: "https://www.linkedin.com/in/laura",
      notes: "Escribió primero",
      isProcessStart: true,
    });
  });

  it("al editar parte de los datos actuales, no ofrece la marca y envía vacíos como null", () => {
    const onSubmit = vi.fn(async () => true);
    const onCancel = vi.fn();
    render(
      <ContactForm
        initial={contact({ name: "Laura", email: "laura@example.com" })}
        submitLabel="Guardar contacto"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("laura@example.com");
    expect(screen.queryByLabelText("Inició el proceso")).toBeNull();
    fill("Email", "");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contacto" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Laura",
      title: null,
      email: null,
      phone: null,
      profileUrl: null,
      notes: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
