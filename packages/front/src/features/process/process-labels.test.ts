import { VACANCY_STATUSES } from "@apply/shared";
import { describe, expect, it } from "vitest";
import { STATUS_LABEL, statusText } from "./process-labels";

describe("etiquetas del proceso (#82)", () => {
  it("cada estado tiene una etiqueta propia", () => {
    const labels = VACANCY_STATUSES.map((s) => STATUS_LABEL[s]);
    expect(new Set(labels).size).toBe(VACANCY_STATUSES.length);
  });

  it("el descarte lleva su motivo y los demás estados no", () => {
    expect(statusText("discarded", "withdrawn")).toBe("Descartada (me retiré)");
    expect(statusText("discarded", null)).toBe("Descartada");
    expect(statusText("interview", null)).toBe("Entrevista");
  });
});
