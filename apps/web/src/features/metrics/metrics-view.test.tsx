// @vitest-environment happy-dom
import type { TrackingMetrics } from "@apply/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CHANNELS } from "../applications/fixtures.ts";
import { MetricsView } from "./metrics-view";

afterEach(cleanup);

const METRICS: TrackingMetrics = {
  applications: 4,
  companiesContacted: 2,
  activeProcesses: 2,
  classified: 3,
  contactOrigin: [
    { channel: "email", count: 2 },
    { channel: "whatsapp", count: 1 },
    { channel: null, count: 1 },
  ],
  open: 3,
  closed: 1,
};

const metric = (label: string) =>
  screen.getByText(label).closest('[data-id="metrics-view__metric"]') as HTMLElement;

describe("MetricsView", () => {
  it("muestra cada métrica con su nombre y su valor", () => {
    render(<MetricsView metrics={METRICS} channels={CHANNELS} />);
    const values = {
      Postulaciones: "4",
      "Empresas que contactaron": "2",
      "Procesos activos": "2",
      Clasificadas: "3",
      Abiertas: "3",
      Cerradas: "1",
    };
    for (const [label, value] of Object.entries(values)) {
      expect(within(metric(label)).getByText(value)).toBeTruthy();
    }
  });

  it("lista el origen del contacto con el nombre del canal, el slug si no lo conoce y sin canal", () => {
    render(<MetricsView metrics={METRICS} channels={CHANNELS} />);
    const rows = screen
      .getAllByRole("listitem")
      .map((li) => Array.from(li.children, (cell) => cell.textContent));
    expect(rows).toEqual([
      ["Correo", "2"],
      ["whatsapp", "1"],
      ["sin canal", "1"],
    ]);
  });

  it("sin primeros contactos lo dice en lugar de la lista", () => {
    render(<MetricsView metrics={{ ...METRICS, contactOrigin: [] }} channels={CHANNELS} />);
    expect(screen.queryAllByRole("listitem")).toEqual([]);
    expect(screen.getByText("Ninguna postulación tiene contacto todavía.")).toBeTruthy();
  });
});
