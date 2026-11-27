import { describe, expect, it } from "vitest";
import { composeBody, greeting, recipientFromText, resolveRecipient } from "./draft.ts";

describe("greeting (AC-001)", () => {
  it("saluda al poster por su primer nombre en el idioma de la vacante", () => {
    expect(greeting("es", "Laura Gómez")).toBe("Hola Laura,");
    expect(greeting("en", "  Jane   Doe ")).toBe("Hi Jane,");
  });

  it("sin poster usa un saludo genérico, sin inventar un nombre", () => {
    expect(greeting("es", null)).toBe("Hola,");
    expect(greeting("en", null)).toBe("Hello,");
    expect(greeting("en", "   ")).toBe("Hello,");
  });
});

describe("composeBody", () => {
  it("antepone el saludo al cuerpo redactado, separado por una línea en blanco", () => {
    expect(composeBody("en", "Jane Doe", "  I am applying.\n\nBest,\nAna  ")).toBe(
      "Hi Jane,\n\nI am applying.\n\nBest,\nAna",
    );
    expect(composeBody("es", null, "Me postulo.")).toBe("Hola,\n\nMe postulo.");
  });
});

describe("recipientFromText (REQ-004)", () => {
  it("toma el primer email que aparece en el texto de la vacante", () => {
    expect(recipientFromText("Envía tu CV a Talento@Acme.com. o a rrhh@acme.com")).toBe(
      "Talento@Acme.com",
    );
  });

  it("conserva los subdominios del email completo", () => {
    expect(recipientFromText("Escribe a talento@mail.acme.com.co hoy")).toBe(
      "talento@mail.acme.com.co",
    );
  });

  it("devuelve null si el texto no trae un email", () => {
    expect(recipientFromText("Postúlate desde el portal. Escríbenos @acme")).toBeNull();
    expect(recipientFromText("")).toBeNull();
  });
});

describe("resolveRecipient (AC-004)", () => {
  const text = "Contacto: jobs@acme.com";

  it("sin destinatario en la petición usa el de la vacante", () => {
    expect(resolveRecipient(undefined, text)).toBe("jobs@acme.com");
    expect(resolveRecipient(undefined, "sin email")).toBeNull();
  });

  it("un destinatario vacío o null queda como faltante", () => {
    expect(resolveRecipient("", text)).toBeNull();
    expect(resolveRecipient(null, text)).toBeNull();
  });

  it("un destinatario manual manda sobre el de la vacante", () => {
    expect(resolveRecipient("ana@example.com", text)).toBe("ana@example.com");
  });
});
