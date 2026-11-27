import { APPLICATION_STATUSES } from "@apply/shared";
import { describe, expect, it } from "vitest";
import { application, event } from "./fixtures.ts";
import {
  chronological,
  cvsForVacancy,
  matchesFilter,
  type PipelineFilter,
  STATUS_LABEL,
  toPipelineRows,
} from "./pipeline.ts";

const rows = [
  application({ id: "1", status: "applied", active: true }),
  application({ id: "2", status: "interview", active: true }),
  application({ id: "3", status: "rejected", active: false }),
  application({ id: "4", status: "withdrawn", active: false }),
];
const ids = (list: { id: string }[]) => list.map((a) => a.id);
const filterApplications = (list: typeof rows, f: PipelineFilter) =>
  list.filter((a) => matchesFilter(a, f));

describe("matchesFilter", () => {
  it("sin filtros devuelve todas", () => {
    expect(ids(filterApplications(rows, { status: "all", state: "all" }))).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("por estado deja solo las de ese estado", () => {
    expect(ids(filterApplications(rows, { status: "interview", state: "all" }))).toEqual(["2"]);
  });

  it("activas y cerradas se separan por `active`", () => {
    expect(ids(filterApplications(rows, { status: "all", state: "active" }))).toEqual(["1", "2"]);
    expect(ids(filterApplications(rows, { status: "all", state: "closed" }))).toEqual(["3", "4"]);
  });

  it("combina estado y activa/cerrada", () => {
    expect(filterApplications(rows, { status: "rejected", state: "active" })).toEqual([]);
    expect(ids(filterApplications(rows, { status: "rejected", state: "closed" }))).toEqual(["3"]);
  });
});

describe("chronological", () => {
  it("ordena por fecha del evento y, a igual fecha, por orden de registro", () => {
    const events = [
      event({ id: "3", occurredAt: "2026-11-09T10:00:00.000Z" }),
      event({
        id: "2",
        occurredAt: "2026-11-01T10:00:00.000Z",
        createdAt: "2026-11-02T00:00:00.000Z",
      }),
      event({
        id: "1",
        occurredAt: "2026-11-01T10:00:00.000Z",
        createdAt: "2026-11-01T00:00:00.000Z",
      }),
    ];
    expect(ids(chronological(events))).toEqual(["1", "2", "3"]);
  });

  it("no modifica el arreglo recibido", () => {
    const events = [event({ id: "2", occurredAt: "2026-11-02T00:00:00.000Z" }), event({ id: "1" })];
    chronological(events);
    expect(ids(events)).toEqual(["2", "1"]);
  });
});

it("cada estado tiene una etiqueta propia", () => {
  const labels = APPLICATION_STATUSES.map((s) => STATUS_LABEL[s]);
  expect(new Set(labels).size).toBe(APPLICATION_STATUSES.length);
  for (const label of labels) expect(label.trim()).not.toBe("");
  expect(STATUS_LABEL.applied).toBe("Postulada");
  expect(STATUS_LABEL.rejected).toBe("Rechazada");
});

describe("toPipelineRows", () => {
  const vacancies = [{ id: "10", title: "Backend", company: "Acme" }];

  it("une cada postulación con el título y la empresa de su vacante", () => {
    const rows = toPipelineRows([application({ id: "1", vacancyId: "10" })], vacancies);
    expect(rows).toEqual([
      {
        application: application({ id: "1", vacancyId: "10" }),
        vacancy: "Backend",
        company: "Acme",
      },
    ]);
  });

  it("marca la vacante borrada en vez de perder la postulación", () => {
    const rows = toPipelineRows([application({ vacancyId: "99" })], vacancies);
    expect(rows[0]).toMatchObject({ vacancy: "Vacante eliminada", company: "—" });
  });
});

describe("cvsForVacancy", () => {
  const cv = (id: string, vacancyId: string | null) => ({ id, vacancyId });

  it("deja solo los CVs generados para la vacante elegida", () => {
    const cvs = [cv("a", "10"), cv("b", "11"), cv("c", null), cv("d", "10")];
    expect(cvsForVacancy(cvs, "10").map((c) => c.id)).toEqual(["a", "d"]);
  });

  it("sin vacante elegida no ofrece CVs", () => {
    expect(cvsForVacancy([cv("c", null)], "")).toEqual([]);
  });
});
