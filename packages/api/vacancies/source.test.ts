import { describe, expect, it } from "vitest";
import { vacancySource } from "./source.ts";

describe("vacancySource (REQ-004)", () => {
  it("es image si la vacante vino de una imagen, aunque no tenga URL", () => {
    expect(vacancySource({ fromImage: true, sourceUrl: null })).toBe("image");
  });
  it("conserva url y text en los demás casos", () => {
    expect(vacancySource({ sourceUrl: "https://example.com/j" })).toBe("url");
    expect(vacancySource({ sourceUrl: null })).toBe("text");
    expect(vacancySource({ fromImage: false, sourceUrl: "https://example.com/j" })).toBe("url");
    expect(vacancySource({ fromImage: false, sourceUrl: null })).toBe("text");
  });
});
