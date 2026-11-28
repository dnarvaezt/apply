import { describe, expect, it } from "vitest";
import { vacancy } from "./fixtures.ts";
import { matchesSearch, matchesStatus, toVacancyRows } from "./vacancy-rows.ts";

const cv = (id: string, vacancyId: string | null) => ({ id, vacancyId });

describe("toVacancyRows (#73)", () => {
  it("une cada vacante con cuántos CVs tiene", () => {
    const rows = toVacancyRows(
      [vacancy({ id: "10" }), vacancy({ id: "11" })],
      [cv("a", "10"), cv("b", "10"), cv("c", null)],
    );
    expect(rows.map((r) => [r.vacancy.id, r.cvCount])).toEqual([
      ["10", 2],
      ["11", 0],
    ]);
  });
});

describe("matchesSearch (#73)", () => {
  const row = toVacancyRows([vacancy({ title: "Ingeniera Backend", company: "Nequi" })], [])[0];

  it("busca en título y empresa sin distinguir mayúsculas ni tildes", () => {
    expect(row && matchesSearch(row, "")).toBe(true);
    expect(row && matchesSearch(row, "  backend ")).toBe(true);
    expect(row && matchesSearch(row, "NEQUI")).toBe(true);
    expect(row && matchesSearch(row, "ingenieria")).toBe(false);
    expect(row && matchesSearch(row, "ingeniéra")).toBe(true);
  });
});

describe("matchesStatus (#82)", () => {
  const [row] = toVacancyRows([vacancy({ status: "interview" })], []);

  it("deja pasar el estado elegido, o todas sin filtro", () => {
    expect(row && matchesStatus(row, "")).toBe(true);
    expect(row && matchesStatus(row, "interview")).toBe(true);
    expect(row && matchesStatus(row, "applied")).toBe(false);
  });
});
