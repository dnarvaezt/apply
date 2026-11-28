import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMime, encodeSubject, newMessageId } from "./mime.ts";

const PDF = Buffer.from("%PDF-1.7\n% contenido de prueba con bytes ÿ\u0000\n%%EOF");

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

/** Separa encabezados y cuerpo de una entidad MIME (RFC 2045). */
function entity(text: string) {
  const [head = "", ...rest] = text.split("\r\n\r\n");
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r\n[ \t]/g, " ").split("\r\n")) {
    const at = line.indexOf(":");
    headers.set(line.slice(0, at).toLowerCase(), line.slice(at + 1).trim());
  }
  return { headers, body: rest.join("\r\n\r\n") };
}

function parts(raw: string) {
  const message = entity(decode(raw));
  const boundary = message.headers.get("content-type")?.match(/boundary="([^"]+)"/)?.[1] ?? "";
  const sections = message.body.split(`--${boundary}`);
  expect(sections.at(-1)?.startsWith("--")).toBe(true);
  return { message, parts: sections.slice(1, -1).map((s) => entity(s.replace(/^\r\n/, ""))) };
}

/** Decodifica las palabras `=?UTF-8?B?…?=` de un encabezado (RFC 2047). */
const decodeWords = (value: string) =>
  value
    .split(" ")
    .map((w) => w.match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=$/)?.[1])
    .map((b64) => {
      if (b64 === undefined) throw new Error(`palabra no codificada: ${value}`);
      return Buffer.from(b64, "base64");
    })
    .reduce((all, b) => Buffer.concat([all, b]), Buffer.alloc(0))
    .toString("utf8");

const input = {
  to: "talento@example.com",
  subject: "Postulación: Ingeniera Backend — Señor",
  body: "Hola Laura,\n\nMe interesa el rol.\nSaludos.",
  pdf: PDF,
  filename: "CV-ana-backend.pdf",
  messageId: "<apply-1234@apply.local>",
  date: new Date("2026-11-27T15:04:05Z"),
};

describe("buildMime (AC-001)", () => {
  it("el raw es base64url y lleva Message-ID propio, To, Date y Subject codificado", () => {
    const raw = buildMime(input);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const { message } = parts(raw);
    expect(message.headers.get("message-id")).toBe("<apply-1234@apply.local>");
    expect(message.headers.get("to")).toBe("talento@example.com");
    expect(message.headers.get("date")).toBe("Fri, 27 Nov 2026 15:04:05 GMT");
    expect(message.headers.get("mime-version")).toBe("1.0");
    expect(message.headers.get("content-type")).toMatch(/^multipart\/mixed; boundary="[^"]+"$/);
    expect(decodeWords(message.headers.get("subject") ?? "")).toBe(input.subject);
  });

  it("la parte de texto lleva el cuerpo en UTF-8 y el adjunto es el PDF exacto", () => {
    const {
      parts: [text, pdf, ...extra],
    } = parts(buildMime(input));
    expect(extra).toEqual([]);
    expect(text?.headers.get("content-type")).toBe('text/plain; charset="UTF-8"');
    expect(text?.headers.get("content-transfer-encoding")).toBe("base64");
    expect(Buffer.from(text?.body ?? "", "base64").toString("utf8")).toBe(
      input.body.replace(/\n/g, "\r\n"),
    );

    expect(pdf?.headers.get("content-type")).toBe('application/pdf; name="CV-ana-backend.pdf"');
    expect(pdf?.headers.get("content-disposition")).toBe(
      'attachment; filename="CV-ana-backend.pdf"',
    );
    expect(pdf?.headers.get("content-transfer-encoding")).toBe("base64");
    const attached = Buffer.from(pdf?.body ?? "", "base64");
    const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
    expect(sha(attached)).toBe(sha(PDF));
  });

  it("parte el base64 en líneas de 76 caracteres como pide RFC 2045", () => {
    const big = Buffer.alloc(500, 7);
    const {
      parts: [, pdf],
    } = parts(buildMime({ ...input, pdf: big }));
    const lines = (pdf?.body ?? "").trimEnd().split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(0, -1).every((l) => l.length === 76)).toBe(true);
    expect(Buffer.from(lines.join(""), "base64")).toEqual(big);
  });

  it("cada mensaje usa un boundary que no aparece en su contenido", () => {
    const a = parts(buildMime(input)).message.headers.get("content-type");
    const b = parts(buildMime(input)).message.headers.get("content-type");
    expect(a).not.toBe(b);
  });

  it.each(["a@example.com\r\nBcc: otro@example.com", "a@example.com\nBcc: otro@example.com", ""])(
    "rechaza un destinatario que inyectaría encabezados: %j",
    (to) => {
      expect(() => buildMime({ ...input, to })).toThrow(/destinatario/);
    },
  );

  it("un cuerpo vacío deja la parte de texto vacía y el mensaje cerrado", () => {
    const raw = buildMime({ ...input, body: "" });
    const {
      parts: [text],
    } = parts(raw);
    expect(text?.body.trim()).toBe("");
    expect(decode(raw)).toMatch(/\r\n--apply-[A-Za-z0-9_-]+--\r\n$/);
  });

  it.each(["<sin-cierre@apply.local", "<a@b>\r\nX: y", "sin-angulos@apply.local", "X: y <a@b>"])(
    "rechaza un Message-ID mal formado: %j",
    (messageId) => {
      expect(() => buildMime({ ...input, messageId })).toThrow(/Message-ID/);
    },
  );
});

describe("encodeSubject", () => {
  it("un asunto largo se parte en palabras de 75 caracteres sin cortar caracteres UTF-8", () => {
    const subject = "Postulación ñandú ".repeat(12).trim();
    const encoded = encodeSubject(subject);
    const words = encoded.split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    expect(words.every((w) => w.length <= 75)).toBe(true);
    expect(decodeWords(words.join(" "))).toBe(subject);
  });

  it("una palabra lleva hasta 45 bytes: el byte 46 abre la siguiente", () => {
    const fits = "a".repeat(45);
    expect(encodeSubject(fits)).toBe(`=?UTF-8?B?${Buffer.from(fits).toString("base64")}?=`);
    const words = encodeSubject(`${fits}b`).split("\r\n ");
    expect(words).toEqual([
      `=?UTF-8?B?${Buffer.from(fits).toString("base64")}?=`,
      "=?UTF-8?B?Yg==?=",
    ]);
  });

  it("un asunto vacío produce una palabra vacía", () => {
    expect(encodeSubject("")).toBe("=?UTF-8?B??=");
  });
});

describe("newMessageId", () => {
  it("genera un Message-ID único con dominio propio", () => {
    const a = newMessageId();
    expect(a).toMatch(/^<apply-[0-9a-f-]{36}@apply\.local>$/);
    expect(newMessageId()).not.toBe(a);
  });
});
