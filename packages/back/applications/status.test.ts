import { APPLICATION_STATUSES, type ApplicationStatus } from "@apply/shared";
import { describe, expect, it } from "vitest";
import {
  activeStatusesFrom,
  canRecord,
  isActive,
  isClassifying,
  isTerminal,
  next,
} from "./status.ts";

const auto = (type: Parameters<typeof next>[1]["type"]) => ({ type, source: "auto" as const });
const manual = (type: Parameters<typeof next>[1]["type"]) => ({ type, source: "manual" as const });

describe("next: avance normal", () => {
  it.each([
    ["applied", "contacted", "contacted"],
    ["applied", "interview", "interview"],
    ["contacted", "interview", "interview"],
    ["interview", "offer", "offer"],
    ["applied", "offer", "offer"],
  ] as const)("%s + %s -> %s", (current, type, expected) => {
    expect(next(current, auto(type))).toBe(expected);
  });

  it.each(["offer_accepted", "offer_declined", "rejected", "withdrawn", "closed"] as const)(
    "cualquier estado activo + %s -> %s",
    (terminal) => {
      for (const current of ["applied", "contacted", "interview", "offer"] as const) {
        expect(next(current, auto(terminal))).toBe(terminal);
      }
    },
  );
});

describe("next: un evento de rango menor o igual no retrocede", () => {
  it.each([
    ["interview", "applied"],
    ["interview", "contacted"],
    ["interview", "interview"],
    ["offer", "interview"],
    ["offer", "applied"],
    ["contacted", "applied"],
    ["contacted", "contacted"],
    ["applied", "applied"],
  ] as const)("%s + %s se ignora", (current, type) => {
    expect(next(current, auto(type))).toBe(current);
  });
});

describe("next: terminales pegajosos", () => {
  it.each(["offer_accepted", "offer_declined", "rejected", "withdrawn", "closed"] as const)(
    "%s no cambia con ningún evento salvo reopened manual",
    (terminal) => {
      for (const type of APPLICATION_STATUSES) {
        expect(next(terminal, auto(type))).toBe(terminal);
        expect(next(terminal, manual(type))).toBe(terminal);
      }
      expect(next(terminal, auto("reopened"))).toBe(terminal);
    },
  );
});

describe("next: reopened", () => {
  it.each(["offer_accepted", "offer_declined", "rejected", "withdrawn", "closed"] as const)(
    "reopened manual reabre %s en applied",
    (terminal) => {
      expect(next(terminal, manual("reopened"))).toBe("applied");
    },
  );

  it.each(["applied", "contacted", "interview", "offer"] as const)(
    "reopened manual sobre %s activo no cambia nada",
    (current) => {
      expect(next(current, manual("reopened"))).toBe(current);
    },
  );

  it("tras reabrir, el avance normal vuelve a funcionar", () => {
    const reopened = next("rejected", manual("reopened"));
    expect(next(reopened, auto("interview"))).toBe("interview");
  });
});

describe("isTerminal / isActive", () => {
  it("separa terminales de activos", () => {
    const terminals: ApplicationStatus[] = APPLICATION_STATUSES.filter(isTerminal);
    expect(terminals).toEqual([
      "offer_accepted",
      "offer_declined",
      "rejected",
      "withdrawn",
      "closed",
    ]);
    expect(APPLICATION_STATUSES.filter(isActive)).toEqual([
      "applied",
      "contacted",
      "interview",
      "assessment",
      "offer",
    ]);
  });
});

describe("canRecord (REQ-005)", () => {
  it("rechaza reopened automático y acepta el resto", () => {
    expect(canRecord(auto("reopened"))).toBe(false);
    expect(canRecord(manual("reopened"))).toBe(true);
    expect(canRecord(auto("rejected"))).toBe(true);
    expect(canRecord(manual("applied"))).toBe(true);
  });
});

describe("isClassifying (REQ-006)", () => {
  it("solo interview, assessment y offer fijan classified_at", () => {
    expect(APPLICATION_STATUSES.filter((t) => isClassifying(t))).toEqual([
      "interview",
      "assessment",
      "offer",
    ]);
    expect(isClassifying("reopened")).toBe(false);
  });
});

describe("activeStatusesFrom", () => {
  it("devuelve los activos de ese rango en adelante, en orden de avance", () => {
    expect(activeStatusesFrom("applied")).toEqual([
      "applied",
      "contacted",
      "interview",
      "assessment",
      "offer",
    ]);
    expect(activeStatusesFrom("contacted")).toEqual([
      "contacted",
      "interview",
      "assessment",
      "offer",
    ]);
    expect(activeStatusesFrom("offer")).toEqual(["offer"]);
  });

  it("desde un terminal no hay estados activos", () => {
    expect(activeStatusesFrom("rejected")).toEqual([]);
  });
});

describe("next: prueba técnica", () => {
  it.each([
    ["applied", "assessment"],
    ["contacted", "assessment"],
    ["interview", "assessment"],
  ] as const)("%s + %s -> assessment", (current, type) => {
    expect(next(current, auto(type))).toBe("assessment");
  });

  it("assessment + offer avanza a offer", () => {
    expect(next("assessment", auto("offer"))).toBe("offer");
  });

  it.each(["applied", "contacted", "interview", "assessment"] as const)(
    "assessment + %s no retrocede",
    (type) => {
      expect(next("assessment", auto(type))).toBe("assessment");
    },
  );

  it("assessment es activo y clasifica", () => {
    expect(isActive("assessment")).toBe(true);
    expect(isClassifying("assessment")).toBe(true);
  });
});

describe("next: eventos informativos (nota, seguimiento)", () => {
  it.each(["note", "follow_up"] as const)("%s no cambia ningún estado", (type) => {
    for (const current of APPLICATION_STATUSES) {
      expect(next(current, manual(type))).toBe(current);
    }
  });

  it.each(["note", "follow_up"] as const)("%s se registra y no clasifica", (type) => {
    expect(canRecord(manual(type))).toBe(true);
    expect(isClassifying(type)).toBe(false);
  });
});
