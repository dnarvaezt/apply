import { randomBytes, randomUUID } from "node:crypto";

export interface MimeInput {
  to: string;
  subject: string;
  body: string;
  pdf: Uint8Array;
  filename: string;
  messageId: string;
  date: Date;
}

const CRLF = "\r\n";
/** RFC 2047: una palabra codificada mide como mucho 75 caracteres; `=?UTF-8?B?` + `?=` son 12. */
const MAX_WORD_BYTES = 45;
const SINGLE_ADDRESS = /^[^\s<>",;]+@[^\s<>",;]+$/;
const MESSAGE_ID = /^<[^\s<>]+@[^\s<>]+>$/;

/** Message-ID propio (D8): permite buscar el envío en Gmail si el resultado se perdió (#5). */
export const newMessageId = () => `<apply-${randomUUID()}@apply.local>`;

const word = (bytes: Buffer) => `=?UTF-8?B?${bytes.toString("base64")}?=`;

/** Asunto como palabras `B` de RFC 2047, sin cortar un carácter UTF-8 entre dos palabras. */
export function encodeSubject(subject: string): string {
  const words: string[] = [];
  let chunk = Buffer.alloc(0);
  for (const char of subject) {
    const bytes = Buffer.from(char, "utf8");
    if (chunk.length + bytes.length > MAX_WORD_BYTES) {
      words.push(word(chunk));
      chunk = Buffer.alloc(0);
    }
    chunk = Buffer.concat([chunk, bytes]);
  }
  words.push(word(chunk));
  return words.join(`${CRLF} `);
}

/** Base64 en líneas de 76 caracteres (RFC 2045). */
const base64Lines = (bytes: Uint8Array) =>
  (
    Buffer.from(bytes)
      .toString("base64")
      .match(/.{1,76}/g) ?? []
  ).join(CRLF);

/**
 * Correo RFC 2822 multipart/mixed con el cuerpo en texto y el CV en PDF adjunto (REQ-003),
 * codificado base64url para el campo `raw` de `users.messages.send`.
 */
export function buildMime(input: MimeInput): string {
  if (!SINGLE_ADDRESS.test(input.to)) throw new Error("El destinatario no es un email válido");
  if (!MESSAGE_ID.test(input.messageId)) throw new Error("Message-ID mal formado");
  const boundary = `apply-${randomBytes(18).toString("base64url")}`;
  const text = input.body.replace(/\r?\n/g, CRLF);

  const message = [
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    `Message-ID: ${input.messageId}`,
    `Date: ${input.date.toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(text, "utf8")),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${input.filename}"`,
    `Content-Disposition: attachment; filename="${input.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.pdf),
    `--${boundary}--`,
    "",
  ].join(CRLF);
  return Buffer.from(message, "utf8").toString("base64url");
}
