import type { Channel } from "@apply/shared";

/** Nombre del canal para mostrar; un slug sin fila se muestra tal cual. */
export function channelLabel(channels: Channel[], slug: string | null): string {
  if (slug === null) return "sin canal";
  return channels.find((c) => c.slug === slug)?.name ?? slug;
}

/** Valor `datetime-local` (hora local, minutos) del instante dado. */
export function toLocalInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** `datetime-local` a ISO; vacío no envía fecha y la API usa el momento actual. */
export function localInputToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}
