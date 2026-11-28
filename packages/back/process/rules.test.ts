import { VACANCY_STATUSES } from "@apply/shared";
import { describe, expect, it } from "vitest";
import { advancesAutomatically, moveError } from "./rules.ts";

describe("moveError: mover la vacante como en Jira (#80)", () => {
  it("acepta cualquier estado distinto, también hacia atrás", () => {
    expect(moveError("offer", { to: "applied" })).toBeNull();
    expect(moveError("to_apply", { to: "hired" })).toBeNull();
    expect(moveError("discarded", { to: "interview" })).toBeNull();
  });

  it("rechaza mover al mismo estado", () => {
    expect(moveError("interview", { to: "interview" })).toMatch(/ya está/);
  });

  it("descartar exige un motivo", () => {
    expect(moveError("applied", { to: "discarded" })).toMatch(/motivo/);
    expect(moveError("applied", { to: "discarded", discardReason: null })).toMatch(/motivo/);
    expect(moveError("applied", { to: "discarded", discardReason: "rejected" })).toBeNull();
  });

  it("un motivo solo se acepta al descartar", () => {
    expect(moveError("applied", { to: "offer", discardReason: "closed" })).toMatch(/descartar/);
  });
});

describe("advancesAutomatically: la app solo avanza, nunca retrocede ni reabre", () => {
  it("avanza desde un estado anterior del flujo", () => {
    expect(advancesAutomatically("to_apply", "applied")).toBe(true);
    expect(advancesAutomatically("to_apply", "contacted")).toBe(true);
    expect(advancesAutomatically("applied", "contacted")).toBe(true);
  });

  it("no retrocede ni repite el estado", () => {
    expect(advancesAutomatically("interview", "contacted")).toBe(false);
    expect(advancesAutomatically("contacted", "contacted")).toBe(false);
  });

  it("no saca a la vacante de Contratada ni de Descartada", () => {
    expect(advancesAutomatically("hired", "contacted")).toBe(false);
    expect(advancesAutomatically("discarded", "applied")).toBe(false);
  });

  it("nunca contrata ni descarta por su cuenta", () => {
    for (const from of VACANCY_STATUSES) {
      expect(advancesAutomatically(from, "hired")).toBe(false);
      expect(advancesAutomatically(from, "discarded")).toBe(false);
    }
  });
});
