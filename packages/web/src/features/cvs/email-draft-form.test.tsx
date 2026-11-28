// @vitest-environment happy-dom
import type { EmailDraft } from "@apply/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailDraftForm } from "./email-draft-form";

afterEach(cleanup);

const draft = (overrides: Partial<EmailDraft> = {}): EmailDraft => ({
  id: "e1",
  cvId: "c1",
  to: "jobs@acme.com",
  subject: "Postulación Backend",
  body: "Hola Laura,\n\nMe postulo.",
  language: "es",
  status: "draft",
  sentAt: null,
  applicationId: null,
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
  ...overrides,
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () =>
  screen.getByRole("button", { name: "Guardar borrador" }) as HTMLButtonElement;

describe("EmailDraftForm (REQ-003, REQ-004)", () => {
  it("muestra destinatario, asunto y cuerpo del borrador", () => {
    render(
      <EmailDraftForm draft={draft()} saving={false} onSave={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    expect(field("Para").value).toBe("jobs@acme.com");
    expect(field("Asunto").value).toBe("Postulación Backend");
    expect(field("Cuerpo").value).toBe("Hola Laura,\n\nMe postulo.");
    expect(screen.queryByText(/Falta el destinatario/)).toBeNull();
  });

  it("sin destinatario lo indica junto al campo, sin inventar uno", () => {
    render(
      <EmailDraftForm
        draft={draft({ to: null })}
        saving={false}
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    );
    expect(field("Para").value).toBe("");
    const notice = screen.getByText(/Falta el destinatario/);
    expect(field("Para").getAttribute("aria-describedby")).toBe(notice.id);
    fireEvent.change(field("Para"), { target: { value: "ana@example.com" } });
    expect(screen.queryByText(/Falta el destinatario/)).toBeNull();
  });

  it("guarda solo con cambios y envía los campos editados", () => {
    const onSave = vi.fn();
    render(
      <EmailDraftForm
        draft={draft({ to: null })}
        saving={false}
        onSave={onSave}
        onDirtyChange={vi.fn()}
      />,
    );
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(field("Asunto"), { target: { value: "Asunto editado" } });
    expect(screen.getByText("sin guardar")).toBeTruthy();
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      to: "",
      subject: "Asunto editado",
      body: "Hola Laura,\n\nMe postulo.",
    });
  });

  it("avisa en cada edición si los campos difieren de lo guardado (#21)", () => {
    const onDirtyChange = vi.fn();
    render(
      <EmailDraftForm
        draft={draft()}
        saving={false}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    fireEvent.change(field("Asunto"), { target: { value: "Otro" } });
    fireEvent.change(field("Asunto"), { target: { value: "Postulación Backend" } });
    expect(onDirtyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("no deja guardar mientras se guarda ni con asunto o cuerpo vacíos", () => {
    const { rerender } = render(
      <EmailDraftForm draft={draft()} saving={false} onSave={vi.fn()} onDirtyChange={vi.fn()} />,
    );
    fireEvent.change(field("Asunto"), { target: { value: "   " } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(field("Asunto"), { target: { value: "Otro" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.change(field("Cuerpo"), { target: { value: "" } });
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(field("Cuerpo"), { target: { value: "Texto" } });
    rerender(<EmailDraftForm draft={draft()} saving onSave={vi.fn()} onDirtyChange={vi.fn()} />);
    expect(saveButton().disabled).toBe(true);
  });
});
