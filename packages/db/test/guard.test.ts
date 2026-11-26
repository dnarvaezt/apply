import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestProject } from "vitest/node";
import { setup } from "./global-setup.ts";
import { assertNotDevDatabase } from "./guard.ts";

const DEV = "postgres://apply:change-me@127.0.0.1:5432/apply";

describe("assertNotDevDatabase", () => {
  it("aborta con un error explícito si la URL es la de desarrollo", () => {
    expect(() => assertNotDevDatabase(DEV)).toThrow(/base de desarrollo/);
  });

  it("aborta aunque cambien host, puerto o credenciales, si la base se llama apply", () => {
    expect(() => assertNotDevDatabase("postgres://u:p@localhost:5999/apply")).toThrow(
      /base de desarrollo/,
    );
  });

  it("aborta si la URL no se puede interpretar", () => {
    expect(() => assertNotDevDatabase("no-es-una-url")).toThrow(/DATABASE_URL/);
  });

  it("permite una base de pruebas", () => {
    expect(() => assertNotDevDatabase("postgres://t:t@127.0.0.1:55432/apply_test")).not.toThrow();
  });

  it("permite que DATABASE_URL no esté definida", () => {
    expect(() => assertNotDevDatabase(undefined)).not.toThrow();
  });
});

describe("global setup de integración", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("aborta antes de levantar contenedores si DATABASE_URL es la de desarrollo", async () => {
    vi.stubEnv("DATABASE_URL", DEV);
    const provide = vi.fn();
    await expect(setup({ provide } as unknown as TestProject)).rejects.toThrow(
      /base de desarrollo/,
    );
    expect(provide).not.toHaveBeenCalled();
  });
});
