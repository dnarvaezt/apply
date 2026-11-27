import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT } from "../paths.ts";
import { GMAIL_SCOPES, readGmailConfig, resolveTokenDir } from "./config.ts";

describe("readGmailConfig", () => {
  it("AC-004: sin credenciales de Google devuelve null (Gmail no configurado)", () => {
    expect(readGmailConfig({})).toBeNull();
    expect(readGmailConfig({ GOOGLE_CLIENT_ID: "id" })).toBeNull();
    expect(readGmailConfig({ GOOGLE_CLIENT_SECRET: "secreto" })).toBeNull();
    expect(readGmailConfig({ GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "secreto" })).toBeNull();
    expect(readGmailConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "  " })).toBeNull();
  });

  it("con credenciales lee el cliente, la carpeta de tokens y los endpoints opcionales", () => {
    const tokenDir = path.join(path.dirname(APP_ROOT), "apply-tokens-prueba");
    expect(
      readGmailConfig({
        GOOGLE_CLIENT_ID: " id ",
        GOOGLE_CLIENT_SECRET: "secreto",
        APPLY_CONFIG_DIR: tokenDir,
        GOOGLE_OAUTH_AUTH_URL: "http://127.0.0.1:1/auth",
        GOOGLE_OAUTH_TOKEN_URL: "http://127.0.0.1:1/token",
        GMAIL_API_ROOT_URL: "http://127.0.0.1:1/",
      }),
    ).toEqual({
      clientId: "id",
      clientSecret: "secreto",
      tokenDir,
      authUrl: "http://127.0.0.1:1/auth",
      tokenUrl: "http://127.0.0.1:1/token",
      apiRootUrl: "http://127.0.0.1:1/",
    });
    const minimal = readGmailConfig({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "s",
      GOOGLE_OAUTH_AUTH_URL: "",
    });
    expect(minimal).toMatchObject({
      authUrl: undefined,
      tokenUrl: undefined,
      apiRootUrl: undefined,
    });
  });

  it("pide solo gmail.send y gmail.readonly", () => {
    expect(GMAIL_SCOPES).toEqual([
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
  });
});

describe("resolveTokenDir (AC-005)", () => {
  it("por defecto usa ~/.config/apply", () => {
    expect(resolveTokenDir(undefined, "/home/alguien")).toBe("/home/alguien/.config/apply");
    expect(resolveTokenDir("", "/home/alguien")).toBe("/home/alguien/.config/apply");
  });

  it("acepta una carpeta fuera del repo, también una hermana con prefijo común", () => {
    const sibling = `${APP_ROOT}-tokens`;
    expect(resolveTokenDir(sibling)).toBe(sibling);
  });

  it.each([APP_ROOT, path.join(APP_ROOT, "data"), path.join(APP_ROOT, ".config", "apply")])(
    "rechaza una carpeta dentro del repo: %s",
    (dir) => {
      expect(() => resolveTokenDir(dir)).toThrow(/dentro del repo/);
    },
  );

  it("rechaza un home dentro del repo", () => {
    expect(() => resolveTokenDir(undefined, APP_ROOT)).toThrow(/dentro del repo/);
  });
});
