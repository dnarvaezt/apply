// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsList } from "./applications-list";
import { application } from "./fixtures.ts";

afterEach(cleanup);

const rows = [
  { application: application({ id: "1", status: "applied" }), vacancy: "Backend", company: "ACME" },
  { application: application({ id: "2", status: "interview" }), vacancy: "SRE", company: "Globex" },
  {
    application: application({ id: "3", status: "rejected", active: false }),
    vacancy: "Data",
    company: "Initech",
  },
];

const items = () => screen.getAllByRole("listitem");

describe("ApplicationsList (AC-001)", () => {
  it("muestra vacante, empresa, estado y si está activa o cerrada", () => {
    render(<ApplicationsList rows={rows} selectedId={null} onSelect={() => {}} />);
    expect(items()).toHaveLength(3);
    const first = within(items()[0]);
    expect(first.getByText("Backend")).toBeTruthy();
    expect(first.getByText("ACME")).toBeTruthy();
    expect(first.getByText("Postulada")).toBeTruthy();
    expect(first.getByText("Activa")).toBeTruthy();
    expect(within(items()[2]).getByText("Cerrada")).toBeTruthy();
  });

  it("el filtro por estado deja solo las coincidentes", () => {
    render(<ApplicationsList rows={rows} selectedId={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "interview" } });
    expect(items()).toHaveLength(1);
    expect(within(items()[0]).getByText("SRE")).toBeTruthy();
  });

  it("el filtro de cerradas deja solo las terminales", () => {
    render(<ApplicationsList rows={rows} selectedId={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText("Activa o cerrada"), { target: { value: "closed" } });
    expect(items()).toHaveLength(1);
    expect(within(items()[0]).getByText("Data")).toBeTruthy();
  });

  it("avisa cuando el filtro no deja ninguna", () => {
    render(<ApplicationsList rows={rows} selectedId={null} onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "offer" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Ninguna postulación coincide con el filtro.")).toBeTruthy();
  });

  it("al elegir una postulación avisa su id", () => {
    const onSelect = vi.fn();
    render(<ApplicationsList rows={rows} selectedId="2" onSelect={onSelect} />);
    fireEvent.click(within(items()[0]).getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("1");
    expect(within(items()[1]).getByRole("button").getAttribute("aria-current")).toBe("true");
  });
});
