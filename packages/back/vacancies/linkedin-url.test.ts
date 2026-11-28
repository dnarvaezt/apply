import { describe, expect, it } from "vitest";
import { canonicalVacancyUrl } from "./linkedin-url.ts";

describe("canonicalVacancyUrl (#71)", () => {
  it("convierte una búsqueda de LinkedIn con currentJobId en la vista de esa vacante", () => {
    expect(
      canonicalVacancyUrl(
        "https://www.linkedin.com/jobs/search-results/?currentJobId=4495320408&eBP=Cw&keywords=x&geoId=1%2C2",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4495320408/");
    expect(
      canonicalVacancyUrl("https://co.linkedin.com/jobs/collections/recommended/?currentJobId=7"),
    ).toBe("https://www.linkedin.com/jobs/view/7/");
  });

  it("deja igual otras URLs, un currentJobId no numérico y lo que no es URL", () => {
    for (const url of [
      "https://www.linkedin.com/jobs/view/4495320408/",
      "https://jobs.example.com/?currentJobId=42",
      "https://evil-linkedin.com/jobs/?currentJobId=42",
      "https://www.linkedin.com/jobs/search/?currentJobId=abc",
      "no es url",
    ]) {
      expect(canonicalVacancyUrl(url)).toBe(url);
    }
  });
});
