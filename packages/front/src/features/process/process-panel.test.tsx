// @vitest-environment happy-dom
import type { MoveStatusRequest, StatusChange, VacancyProcess } from "@apply/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNELS, contact } from "../applications/fixtures";
import { ProcessPanel } from "./process-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const change = (overrides: Partial<StatusChange>): StatusChange => ({
  id: "1",
  from: null,
  to: "applied",
  discardReason: null,
  note: null,
  channel: null,
  source: "manual",
  occurredAt: "2026-11-02T15:00:00.000Z",
  createdAt: "2026-11-02T15:00:00.000Z",
  ...overrides,
});

/** Servidor falso: guarda el proceso y aplica cada POST /status como lo haría la API. */
function serve(initial: VacancyProcess) {
  let process = initial;
  const moves: MoveStatusRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://x").pathname.replace(/^\/api/, "");
      if (path === "/channels") return reply(CHANNELS);
      if (path === "/vacancies/10/process") return reply(process);
      if (path === "/vacancies/10/status" && init?.method === "POST") {
        const req = JSON.parse(String(init.body)) as MoveStatusRequest;
        moves.push(req);
        const next = change({
          id: String(process.history.length + 1),
          from: process.status,
          to: req.to,
          discardReason: req.discardReason ?? null,
          note: req.note ?? null,
          channel: req.channel ?? null,
        });
        process = {
          ...process,
          status: req.to,
          discardReason: req.discardReason ?? null,
          history: [next, ...process.history],
        };
        return reply(process, 201);
      }
      return reply({ error: "falla" }, 500);
    }),
  );
  return moves;
}

const PROCESS: VacancyProcess = {
  vacancyId: "10",
  status: "applied",
  discardReason: null,
  history: [change({ note: "Enviado por el portal" })],
  contacts: [contact({ name: "Laura Gómez" })],
};

describe("ProcessPanel (#82)", () => {
  it("muestra el estado actual, el historial con su nota y los contactos", async () => {
    serve(PROCESS);
    render(<ProcessPanel vacancyId="10" />);

    const status = (await screen.findByText("Estado")).closest("[data-id='process-panel__status']");
    expect(within(status as HTMLElement).getByText("Postulada")).toBeTruthy();
    expect(screen.getByText("Enviado por el portal")).toBeTruthy();
    expect(screen.getByText("Laura Gómez")).toBeTruthy();
  });

  it("Mover a… con nota y canal deja el nuevo estado arriba del historial", async () => {
    const moves = serve(PROCESS);
    render(<ProcessPanel vacancyId="10" />);
    fireEvent.click(await screen.findByRole("button", { name: "Mover a…" }));

    const dialog = await screen.findByRole("dialog");
    const select = within(dialog).getByLabelText("Nuevo estado") as HTMLSelectElement;
    // El estado actual no se ofrece: mover a él no cambia nada.
    expect(within(select).queryByRole("option", { name: "Postulada" })).toBeNull();
    fireEvent.change(select, { target: { value: "interview" } });
    fireEvent.change(within(dialog).getByLabelText("Canal"), { target: { value: "linkedin" } });
    fireEvent.change(within(dialog).getByLabelText("Nota (opcional)"), {
      target: { value: "Entrevista técnica el jueves" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mover" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(moves).toEqual([
      { to: "interview", note: "Entrevista técnica el jueves", channel: "linkedin" },
    ]);
    const items = screen.getAllByText(/Entrevista técnica el jueves|Enviado por el portal/);
    expect(items.map((i) => i.textContent)).toEqual([
      "Entrevista técnica el jueves",
      "Enviado por el portal",
    ]);
    expect(screen.getAllByText("LinkedIn", { exact: false }).length).toBeGreaterThan(0);
  });

  it("descartar exige el motivo antes de habilitar Mover y lo muestra en el estado", async () => {
    const moves = serve(PROCESS);
    render(<ProcessPanel vacancyId="10" />);
    fireEvent.click(await screen.findByRole("button", { name: "Mover a…" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Nuevo estado"), {
      target: { value: "discarded" },
    });
    const submit = within(dialog).getByRole("button", { name: "Mover" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Motivo del descarte"), {
      target: { value: "withdrawn" },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(moves).toEqual([{ to: "discarded", discardReason: "withdrawn" }]));
    const status = screen.getByText("Estado").closest("[data-id='process-panel__status']");
    expect(within(status as HTMLElement).getByText("Descartada (me retiré)")).toBeTruthy();
  });

  it("si el proceso no carga muestra el error y Reintentar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply({ error: "Vacante no encontrada" }, 404)),
    );
    render(<ProcessPanel vacancyId="10" />);
    expect((await screen.findByRole("alert")).textContent).toContain("Vacante no encontrada");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
