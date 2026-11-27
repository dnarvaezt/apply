/** Lo que la detección necesita de un mensaje de Gmail (formato `metadata`, encabezado From). */
export interface GmailMessageMeta {
  id: string;
  from: string;
  date: Date;
  labelIds: string[];
}

/** Forma mínima de `gmail_v1.Schema$Message` que se lee. */
export interface GmailMessageShape {
  id?: string | null;
  internalDate?: string | null;
  labelIds?: string[] | null;
  payload?: { headers?: { name?: string | null; value?: string | null }[] | null } | null;
}

/** Remitentes de rebote: nunca son una respuesta de la empresa (REQ-004). */
const BOUNCE = /^(mailer-daemon|postmaster)@/;

/** Dirección del encabezado From, en minúsculas: `Laura <L@x.com>` → `l@x.com`. */
export function senderAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
}

/** Consulta de `messages.list` para correos del contacto desde el envío (D8, REQ-002). */
export function contactQuery(email: string, sentAt: Date): string {
  return `from:${email.trim().toLowerCase()} after:${Math.floor(sentAt.getTime() / 1000)}`;
}

/** Mensaje de Gmail → metadatos; `null` si le falta el id o la fecha. */
export function messageMeta(message: GmailMessageShape): GmailMessageMeta | null {
  const millis = Number(message.internalDate);
  if (!message.id || !message.internalDate || !Number.isFinite(millis)) return null;
  const from = message.payload?.headers?.find((h) => h.name?.toLowerCase() === "from");
  return {
    id: message.id,
    from: from?.value ?? "",
    date: new Date(millis),
    labelIds: message.labelIds ?? [],
  };
}

/**
 * Respuesta de la empresa: llegó después del envío, no la envió el usuario (por cuenta o
 * etiqueta SENT) y no es un rebote (REQ-001, REQ-004).
 */
export function isIncomingReply(
  message: GmailMessageMeta,
  { account, sentAt }: { account: string | null; sentAt: Date },
): boolean {
  const from = senderAddress(message.from);
  const ownMessage = message.labelIds.includes("SENT") || from === account?.toLowerCase();
  return message.date > sentAt && !ownMessage && !BOUNCE.test(from);
}
