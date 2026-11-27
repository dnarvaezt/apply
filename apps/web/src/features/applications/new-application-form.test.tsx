// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewApplicationForm } from "./new-application-form";

afterEach(cleanup);

const vacancies = [
  { id: "10", title: "Backend", company: "Acme" },
  { id: "11", title: "SRE", company: "Globex" },
];
const cvs = [
  { id: "a", title: "CV Backend", vacancyId: "10" },
  { id: "b", title: "CV SRE", vacancyId: "11" },
];

const optionTexts = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);

describe("NewApplicationForm (REQ-004)", () => {
  it("ofrece solo los CVs de la vacante elegida", () => {
    render(<NewApplicationForm vacancies={vacancies} cvs={cvs} onCreate={vi.fn()} />);
    expect(optionTexts("Vacante")).toEqual(["Elige una vacante", "Backend · Acme", "SRE · Globex"]);
    fireEvent.change(screen.getByLabelText("Vacante"), { target: { value: "11" } });
    expect(optionTexts("CV")).toEqual(["Sin CV", "CV SRE"]);
  });

  it("no deja registrar sin vacante", () => {
    render(<NewApplicationForm vacancies={vacancies} cvs={cvs} onCreate={vi.fn()} />);
    const submit = screen.getByRole("button", {
      name: "Registrar postulación",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("envía la vacante y el CV elegidos y limpia el formulario", async () => {
    const onCreate = vi.fn(async () => true);
    render(<NewApplicationForm vacancies={vacancies} cvs={cvs} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Vacante"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("CV"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar postulación" }));
    expect(onCreate).toHaveBeenCalledWith({ vacancyId: "10", cvId: "a" });
    await screen.findByDisplayValue("Elige una vacante");
  });

  it("sin CV elegido envía cvId null y cambiar de vacante descarta el CV anterior", () => {
    const onCreate = vi.fn(async () => false);
    render(<NewApplicationForm vacancies={vacancies} cvs={cvs} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Vacante"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("CV"), { target: { value: "a" } });
    fireEvent.change(screen.getByLabelText("Vacante"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar postulación" }));
    expect(onCreate).toHaveBeenCalledWith({ vacancyId: "11", cvId: null });
  });
});
