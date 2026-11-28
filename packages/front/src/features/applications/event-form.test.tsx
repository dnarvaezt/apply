// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventForm } from "./event-form";
import { CHANNELS, contact } from "./fixtures.ts";

afterEach(cleanup);

const contacts = [contact({ id: "7", name: "Laura Gómez" })];
const optionTexts = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);

describe("EventForm (REQ-003)", () => {
  it("ofrece tipos, canales de la tabla y los contactos de la postulación", () => {
    render(<EventForm channels={CHANNELS} contacts={contacts} onSubmit={vi.fn()} />);
    expect(optionTexts("Tipo")).toContain("Entrevista");
    expect(optionTexts("Canal")).toEqual(["Sin canal", "ATS", "Correo", "LinkedIn"]);
    expect(optionTexts("Contacto")).toEqual(["Sin contacto", "Laura Gómez"]);
    expect(screen.getByLabelText("Fecha").getAttribute("max")).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d$/,
    );
  });

  it("envía el evento manual con tipo, canal, fecha, contacto y notas, y limpia el formulario", async () => {
    const onSubmit = vi.fn(async () => true);
    render(<EventForm channels={CHANNELS} contacts={contacts} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "interview" } });
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "linkedin" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-11-03T16:30" } });
    fireEvent.change(screen.getByLabelText("Contacto"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: " Primera ronda " } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "interview",
      source: "manual",
      channel: "linkedin",
      occurredAt: new Date(2026, 10, 3, 16, 30).toISOString(),
      contactId: "7",
      notes: "Primera ronda",
    });
    await screen.findByDisplayValue("Sin contacto");
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).value).toBe("");
  });

  it("los campos vacíos se envían como null y un fallo conserva lo escrito", async () => {
    const onSubmit = vi.fn(async () => false);
    render(<EventForm channels={CHANNELS} contacts={[]} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "algo" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar evento" }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "contacted",
      source: "manual",
      channel: null,
      occurredAt: undefined,
      contactId: null,
      notes: "algo",
    });
    await screen.findByRole("button", { name: "Registrar evento" });
    expect((screen.getByLabelText("Notas") as HTMLTextAreaElement).value).toBe("algo");
  });
});
