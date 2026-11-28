import { describe, expect, it } from "vitest";
import { findChromePath } from "./chrome.ts";

describe("findChromePath", () => {
  it("prefiere CHROME_PATH si existe", () => {
    expect(findChromePath({ CHROME_PATH: process.execPath })).toBe(process.execPath);
  });
});
