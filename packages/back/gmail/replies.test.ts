import { describe, expect, it } from "vitest";
import {
  contactQuery,
  type GmailMessageMeta,
  isIncomingReply,
  messageMeta,
  senderAddress,
} from "./replies.ts";

const SENT_AT = new Date("2026-11-20T10:00:00.000Z");
const ACCOUNT = "postulante@example.com";

const message = (overrides: Partial<GmailMessageMeta> = {}): GmailMessageMeta => ({
  id: "m1",
  from: "Laura Gómez <laura@acme.example>",
  date: new Date("2026-11-21T09:00:00.000Z"),
  labelIds: ["INBOX"],
  ...overrides,
});

describe("senderAddress", () => {
  it.each([
    ["Laura Gómez <Laura@ACME.example>", "laura@acme.example"],
    ['"Gómez, Laura" <laura@acme.example>', "laura@acme.example"],
    ["  laura@acme.example ", "laura@acme.example"],
    ["", ""],
  ])("%j → %j", (from, address) => {
    expect(senderAddress(from)).toBe(address);
  });
});

describe("contactQuery", () => {
  it("AC-004: busca por remitente y desde el envío, con el epoch en segundos", () => {
    expect(contactQuery("Laura@ACME.example", new Date("2026-11-20T10:00:00.999Z"))).toBe(
      "from:laura@acme.example after:1795168800",
    );
  });

  it("quita los espacios del email guardado", () => {
    expect(contactQuery("  laura@acme.example ", SENT_AT)).toBe(
      "from:laura@acme.example after:1795168800",
    );
  });
});

describe("messageMeta", () => {
  it("sin encabezados, o con un encabezado sin nombre, deja el From vacío", () => {
    const base = { id: "m1", internalDate: "0" };
    expect(messageMeta({ ...base, payload: {} })?.from).toBe("");
    expect(messageMeta({ ...base, payload: { headers: [{ value: "x@y.example" }] } })?.from).toBe(
      "",
    );
  });

  it("lee id, From (sin importar mayúsculas), fecha y etiquetas", () => {
    expect(
      messageMeta({
        id: "m1",
        internalDate: "1795168800000",
        labelIds: ["INBOX"],
        payload: {
          headers: [
            { name: "Subject", value: "Re: Postulación" },
            { name: "FROM", value: "Laura <laura@acme.example>" },
          ],
        },
      }),
    ).toEqual({
      id: "m1",
      from: "Laura <laura@acme.example>",
      date: new Date("2026-11-20T10:00:00.000Z"),
      labelIds: ["INBOX"],
    });
  });

  it("sin encabezados ni etiquetas deja From vacío y etiquetas vacías", () => {
    expect(messageMeta({ id: "m1", internalDate: "0" })).toEqual({
      id: "m1",
      from: "",
      date: new Date(0),
      labelIds: [],
    });
  });

  it.each([
    [{ internalDate: "1" }],
    [{ id: "", internalDate: "1" }],
    [{ id: "m1" }],
    [{ id: "m1", internalDate: "" }],
    [{ id: "m1", internalDate: "mañana" }],
  ])("sin id o fecha válida (%j) devuelve null", (message) => {
    expect(messageMeta(message)).toBeNull();
  });
});

describe("isIncomingReply", () => {
  const ctx = { account: ACCOUNT, sentAt: SENT_AT };

  it("una respuesta de otra persona posterior al envío cuenta", () => {
    expect(isIncomingReply(message(), ctx)).toBe(true);
  });

  it("AC-003: los mensajes del propio usuario se ignoran, por remitente o por etiqueta SENT", () => {
    expect(isIncomingReply(message({ from: `Yo <${ACCOUNT.toUpperCase()}>` }), ctx)).toBe(false);
    expect(isIncomingReply(message({ labelIds: ["SENT"] }), ctx)).toBe(false);
  });

  it.each([
    "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    "MAILER-DAEMON@acme.example",
    "postmaster@acme.example",
  ])("AC-003: los rebotes (%s) se ignoran", (from) => {
    expect(isIncomingReply(message({ from }), ctx)).toBe(false);
  });

  it("un remitente que solo contiene la palabra no es un rebote", () => {
    expect(isIncomingReply(message({ from: "no-mailer-daemon@acme.example" }), ctx)).toBe(true);
  });

  it("lo que llegó antes del envío o en el mismo instante no es respuesta", () => {
    expect(isIncomingReply(message({ date: new Date(SENT_AT.getTime() - 1) }), ctx)).toBe(false);
    expect(isIncomingReply(message({ date: SENT_AT }), ctx)).toBe(false);
  });

  it("sin cuenta conocida igual descarta lo enviado por la etiqueta SENT", () => {
    const noAccount = { account: null, sentAt: SENT_AT };
    expect(isIncomingReply(message(), noAccount)).toBe(true);
    expect(isIncomingReply(message({ labelIds: ["SENT", "INBOX"] }), noAccount)).toBe(false);
  });
});
