// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNELS } from "./fixtures.ts";
import { NewApplicationForm } from "./new-application-form";

afterEach(cleanup);

/** Los CVs de la vacante, del más reciente al más antiguo. */
const cvs = [
  { id: "a", title: "CV Backend v2" },
  { id: "b", title: "CV Backend v1" },
];

const optionTexts = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Registrar postulación" }));

describe("NewApplicationForm (REQ-004, #73)", () => {
  it("ofrece los CVs de la vacante y elige el más reciente", () => {
    render(<NewApplicationForm cvs={cvs} channels={CHANNELS} onCreate={vi.fn()} />);
    expect(optionTexts("CV")).toEqual(["Sin CV", "CV Backend v2", "CV Backend v1"]);
    expect((screen.getByLabelText("CV") as HTMLSelectElement).value).toBe("a");
  });

  it("envía el CV elegido y, si salió bien, limpia canal y fecha", async () => {
    const onCreate = vi.fn(async () => true);
    render(<NewApplicationForm cvs={cvs} channels={CHANNELS} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("CV"), { target: { value: "b" } });
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "ats" } });
    submit();
    expect(onCreate).toHaveBeenCalledWith({ cvId: "b", channel: "ats", appliedAt: undefined });
    await vi.waitFor(() =>
      expect((screen.getByLabelText("Canal") as HTMLSelectElement).value).toBe(""),
    );
  });

  it("sin CV envía cvId null; sin CVs en la vacante solo ofrece Sin CV", () => {
    const onCreate = vi.fn(async () => false);
    render(<NewApplicationForm cvs={[]} channels={CHANNELS} onCreate={onCreate} />);
    expect(optionTexts("CV")).toEqual(["Sin CV"]);
    submit();
    expect(onCreate).toHaveBeenCalledWith({ cvId: null, channel: null, appliedAt: undefined });
  });

  it("REQ-004: una postulación por otro canal envía el canal y la fecha elegidos", () => {
    const onCreate = vi.fn(async () => true);
    render(<NewApplicationForm cvs={cvs} channels={CHANNELS} onCreate={onCreate} />);
    expect(optionTexts("Canal")).toEqual(["Sin canal", "ATS", "Correo", "LinkedIn"]);
    fireEvent.change(screen.getByLabelText("Canal"), { target: { value: "ats" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-11-02T08:30" } });
    submit();
    expect(onCreate).toHaveBeenCalledWith({
      cvId: "a",
      channel: "ats",
      appliedAt: new Date(2026, 10, 2, 8, 30).toISOString(),
    });
  });
});
