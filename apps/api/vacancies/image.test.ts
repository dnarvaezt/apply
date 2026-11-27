import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, parseVacancyImage } from "./image.ts";

const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");

describe("parseVacancyImage (REQ-001, REQ-005, REQ-006)", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("acepta %s con base64 válido", (mediaType) => {
    const data = b64(10);
    expect(parseVacancyImage({ mediaType, data })).toEqual({
      ok: true,
      value: { mediaType, data },
    });
  });

  it("acepta una imagen de exactamente el máximo", () => {
    expect(parseVacancyImage({ mediaType: "image/png", data: b64(MAX_IMAGE_BYTES) }).ok).toBe(true);
  });

  it("responde 413 si la imagen decodificada pasa del máximo", () => {
    const r = parseVacancyImage({ mediaType: "image/png", data: b64(MAX_IMAGE_BYTES + 1) });
    expect(r).toEqual({ ok: false, status: 413, error: expect.stringMatching(/5 MB/) });
  });

  it.each([
    ["image/gif", b64(10), /PNG, JPEG o WebP/],
    ["application/pdf", b64(10), /PNG, JPEG o WebP/],
    [42, b64(10), /PNG, JPEG o WebP/],
    ["image/png", "no es base64!", /base64/],
    ["image/png", "abc", /base64/],
    ["image/png", "ab=c", /base64/],
    ["image/png", "", /base64/],
    ["image/png", 5, /base64/],
  ])("responde 400 con mediaType %j y data %j", (mediaType, data, message) => {
    expect(parseVacancyImage({ mediaType, data })).toEqual({
      ok: false,
      status: 400,
      error: expect.stringMatching(message),
    });
  });

  it.each([null, undefined, "x", [], 3])("responde 400 si image es %j", (image) => {
    expect(parseVacancyImage(image)).toEqual({
      ok: false,
      status: 400,
      error: expect.stringMatching(/\{ mediaType, data \}/),
    });
  });

  it("distingue los mensajes de tipo y de base64", () => {
    const type = parseVacancyImage({ mediaType: "image/gif", data: b64(3) });
    const data = parseVacancyImage({ mediaType: "image/png", data: "@@@@" });
    expect(type).toMatchObject({ error: expect.stringMatching(/PNG, JPEG o WebP/) });
    expect(data).toMatchObject({ error: expect.stringMatching(/base64/) });
  });
});
