// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationTimeline } from "./application-timeline";
import { event } from "./fixtures.ts";

afterEach(cleanup);

describe("ApplicationTimeline (AC-002)", () => {
  it("ordena por fecha y muestra tipo, canal y origen", () => {
    render(
      <ApplicationTimeline
        events={[
          event({
            id: "2",
            type: "interview",
            occurredAt: "2026-11-05T10:00:00.000Z",
            channel: "linkedin",
            source: "auto",
          }),
          event({
            id: "1",
            type: "applied",
            occurredAt: "2026-11-01T10:00:00.000Z",
            channel: "email",
          }),
        ]}
      />,
    );
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText("Postulada")).toBeTruthy();
    expect(within(first).getByText("email")).toBeTruthy();
    expect(within(first).getByText("manual")).toBeTruthy();
    expect(within(first).getByText("2026-11-01")).toBeTruthy();
    expect(within(second).getByText("Entrevista")).toBeTruthy();
    expect(within(second).getByText("linkedin")).toBeTruthy();
    expect(within(second).getByText("automático")).toBeTruthy();
  });

  it("marca el evento sin canal y muestra sus notas", () => {
    render(
      <ApplicationTimeline events={[event({ type: "reopened", notes: "Volvieron a escribir" })]} />,
    );
    const item = within(screen.getByRole("listitem"));
    expect(item.getByText("Reabierta")).toBeTruthy();
    expect(item.getByText("sin canal")).toBeTruthy();
    expect(item.getByText("Volvieron a escribir")).toBeTruthy();
  });

  it("sin eventos lo dice", () => {
    render(<ApplicationTimeline events={[]} />);
    expect(screen.getByText("Sin eventos todavía.")).toBeTruthy();
  });
});
