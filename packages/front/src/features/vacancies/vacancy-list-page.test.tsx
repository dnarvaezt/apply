// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { application } from "../applications/fixtures";
import { vacancy } from "./fixtures";
import { VacancyListPage } from "./vacancy-list-page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** La frontera es HTTP: vacantes, postulaciones y CVs por ruta. */
function serve(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "http://x").pathname.replace(/^\/api/, "");
      return path in routes ? reply(routes[path]) : reply({ error: "falla" }, 500);
    }),
  );
}

const cv = (id: string, vacancyId: string) => ({
  id,
  vacancyId,
  title: id,
  createdAt: "2026-11-21T10:00:00.000Z",
  updatedAt: "2026-11-21T10:00:00.000Z",
});

describe("VacancyListPage (#73)", () => {
  it("lista cada vacante con su estado, sus CVs y el enlace a su detalle", async () => {
    serve({
      "/vacancies": [
        vacancy({ id: "10", title: "Ingeniera Backend", company: "ACME" }),
        vacancy({ id: "11", title: "Diseñadora", company: "Nequi" }),
      ],
      "/applications": [application({ vacancyId: "10", status: "interview" })],
      "/cvs": [cv("a", "10"), cv("b", "10")],
    });
    render(<VacancyListPage />);

    const backend = (await screen.findByText("Ingeniera Backend")).closest("a");
    expect(backend?.getAttribute("href")).toBe("/vacancies/10");
    expect(within(backend as HTMLElement).getByText("Entrevista")).toBeTruthy();
    expect(within(backend as HTMLElement).getByText("2 CVs")).toBeTruthy();
    const design = screen.getByText("Diseñadora").closest("a") as HTMLElement;
    expect(within(design).getByText("Sin postular")).toBeTruthy();
    expect(screen.getByText("2 ingresadas")).toBeTruthy();
  });

  it("filtra por empresa sin distinguir tildes y avisa si nada coincide", async () => {
    serve({
      "/vacancies": [
        vacancy({ id: "10", title: "Ingeniera Backend", company: "ACME" }),
        vacancy({ id: "11", title: "Diseñadora", company: "Nequi" }),
      ],
      "/applications": [],
      "/cvs": [],
    });
    render(<VacancyListPage />);
    const search = await screen.findByRole("searchbox", { name: "Buscar vacantes" });

    fireEvent.change(search, { target: { value: "disenadora" } });
    expect(screen.queryByText("Ingeniera Backend")).toBeNull();
    expect(screen.getByText("Diseñadora")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("Ninguna vacante coincide")).toBeTruthy();
  });

  it("sin vacantes invita a crear la primera", async () => {
    serve({ "/vacancies": [], "/applications": [], "/cvs": [] });
    render(<VacancyListPage />);

    expect(await screen.findByText("Aún no hay vacantes")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Nueva vacante" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/vacancies/new", "/vacancies/new"]);
  });

  it("si la carga falla muestra el error y Reintentar", async () => {
    serve({});
    render(<VacancyListPage />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "No se pudieron cargar las vacantes",
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
