import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTokenStore, TOKEN_FILE } from "./token-store.ts";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "apply-token-store-"));
  dir = path.join(root, "config", "apply");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const mode = async (p: string) => (await stat(p)).mode & 0o777;

describe("createTokenStore", () => {
  it("sin archivo devuelve null", async () => {
    expect(await createTokenStore(dir).read()).toBeNull();
  });

  it("AC-002: crea la carpeta 0700 y el archivo 0600, y una escritura nueva reemplaza la anterior", async () => {
    const store = createTokenStore(dir);
    expect(store.file).toBe(path.join(dir, TOKEN_FILE));
    await store.write({ refreshToken: "uno", email: "a@example.com", reauthRequired: false });
    expect(await mode(dir)).toBe(0o700);
    expect(await mode(store.file)).toBe(0o600);

    await store.write({ refreshToken: "dos", email: "a@example.com", reauthRequired: true });
    expect(await mode(store.file)).toBe(0o600);
    expect(await store.read()).toEqual({
      refreshToken: "dos",
      email: "a@example.com",
      reauthRequired: true,
    });
    expect(JSON.parse(await readFile(store.file, "utf8")).refreshToken).toBe("dos");
  });

  it("rechaza guardar o leer un archivo sin refresh token", async () => {
    const store = createTokenStore(dir);
    await expect(
      store.write({ refreshToken: "", email: null, reauthRequired: false }),
    ).rejects.toThrow();
    await store.write({ refreshToken: "uno", email: null, reauthRequired: false });
    await writeFile(store.file, JSON.stringify({ email: null }));
    await expect(store.read()).rejects.toThrow();
  });
});
