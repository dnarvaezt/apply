import { APPLICATION_STATUSES, type ApplicationEvent } from "@apply/shared";
import { describe, expect, it } from "vitest";
import { application, CHANNELS, event } from "./fixtures.ts";
import {
  channelLabel,
  chronological,
  currentApplication,
  localInputToIso,
  STATUS_LABEL,
  STATUS_TONE,
  statusSteps,
  toLocalInput,
} from "./pipeline.ts";

const ids = (list: { id: string }[]) => list.map((a) => a.id);

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

describe("fechas del formulario (datetime-local)", () => {
  it("toLocalInput da la hora local en minutos y localInputToIso la devuelve en ISO", () => {
    const at = new Date(2026, 10, 3, 9, 5, 42);
    expect(toLocalInput(at)).toBe("2026-11-03T09:05");
    expect(localInputToIso("2026-11-03T09:05")).toBe(new Date(2026, 10, 3, 9, 5).toISOString());
  });

  it("vacío no envía fecha: la API usa el momento actual", () => {
    expect(localInputToIso("")).toBeUndefined();
  });
});

describe("channelLabel", () => {
  it("usa el nombre del canal, cae al slug si no está y avisa si no hay canal", () => {
    expect(channelLabel(CHANNELS, "email")).toBe("Correo");
    expect(channelLabel(CHANNELS, "fax")).toBe("fax");
    expect(channelLabel(CHANNELS, null)).toBe("sin canal");
  });
});

describe("currentApplication (#73)", () => {
  it("prefiere la activa; si todas están cerradas, la última actualizada", () => {
    const closed = application({ id: "1", active: false, updatedAt: "2026-11-05T00:00:00.000Z" });
    const active = application({ id: "2", active: true, updatedAt: "2026-11-01T00:00:00.000Z" });
    const older = application({ id: "3", active: false, updatedAt: "2026-11-02T00:00:00.000Z" });
    expect(currentApplication([closed, active, older])?.id).toBe("2");
    expect(currentApplication([older, closed])?.id).toBe("1");
    expect(currentApplication([])).toBeNull();
  });
});

describe("statusSteps (#73)", () => {
  const reached = (types: ApplicationEvent["type"][]) =>
    statusSteps(types.map((type, i) => event({ id: String(i), type }))).map((s) => s.reached);

  it("marca alcanzado cada hito que tiene un evento, sin inventar los intermedios", () => {
    expect(statusSteps([]).map((s) => s.label)).toEqual([
      "Postulada",
      "Contactada",
      "Entrevista",
      "Prueba técnica",
      "Oferta",
    ]);
    expect(reached(["applied", "interview"])).toEqual([true, false, true, false, false]);
    expect(reached(["applied", "contacted", "rejected"])).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(reached(["applied", "assessment", "note"])).toEqual([true, false, false, true, false]);
  });
});

describe("STATUS_TONE (#73)", () => {
  it("da un tono a cada estado: en curso, positivo o negativo", () => {
    expect(Object.keys(STATUS_TONE).sort()).toEqual([...APPLICATION_STATUSES].sort());
    expect(STATUS_TONE.offer_accepted).toBe("positive");
    expect(STATUS_TONE.rejected).toBe("negative");
    expect(STATUS_TONE.interview).toBe("progress");
  });
});
