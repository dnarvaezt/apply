import { describe, expect, it } from "vitest";
import { application } from "../applications/fixtures.ts";
import { vacancy } from "./fixtures.ts";
import { matchesSearch, toVacancyRows } from "./vacancy-rows.ts";

const cv = (id: string, vacancyId: string | null) => ({ id, vacancyId });

describe("toVacancyRows (#73)", () => {
  it("une cada vacante con su postulación vigente y cuántos CVs tiene", () => {
    const rows = toVacancyRows(
      [vacancy({ id: "10" }), vacancy({ id: "11" })],
      [
        application({ id: "1", vacancyId: "10", active: false, status: "rejected" }),
        application({ id: "2", vacancyId: "10", active: true, status: "interview" }),
      ],
      [cv("a", "10"), cv("b", "10"), cv("c", null)],
    );
    expect(rows.map((r) => [r.vacancy.id, r.application?.status ?? null, r.cvCount])).toEqual([
      ["10", "interview", 2],
      ["11", null, 0],
    ]);
  });
});

describe("matchesSearch (#73)", () => {
  const row = toVacancyRows([vacancy({ title: "Ingeniera Backend", company: "Nequi" })], [], [])[0];

  it("busca en título y empresa sin distinguir mayúsculas ni tildes", () => {
    expect(row && matchesSearch(row, "")).toBe(true);
    expect(row && matchesSearch(row, "  backend ")).toBe(true);
    expect(row && matchesSearch(row, "NEQUI")).toBe(true);
    expect(row && matchesSearch(row, "ingenieria")).toBe(false);
    expect(row && matchesSearch(row, "ingeniéra")).toBe(true);
  });
});
