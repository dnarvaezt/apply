import { describe, expect, it } from "vitest";
import { readImageFile } from "./image-file";

describe("readImageFile (REQ-007)", () => {
  it("devuelve el tipo del archivo y su contenido en base64", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "v.png", {
      type: "image/png",
    });
    await expect(readImageFile(file)).resolves.toEqual({
      mediaType: "image/png",
      data: "iVBORw==",
    });
  });

  it("codifica archivos más grandes que un bloque sin truncar", async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    const { data } = await readImageFile(new File([bytes], "g.webp", { type: "image/webp" }));
    const decoded = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});
