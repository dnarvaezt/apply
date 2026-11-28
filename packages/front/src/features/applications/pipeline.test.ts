import { describe, expect, it } from "vitest";
import { CHANNELS } from "./fixtures.ts";
import { channelLabel, localInputToIso, toLocalInput } from "./pipeline.ts";

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
