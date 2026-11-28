/** Máximo de un `integer` de Postgres. */
const MAX_ID = 2_147_483_647;

/**
 * La base usa ids enteros y el contrato JSON los sirve como string. Devuelve `null` si el
 * texto no es un id válido: la ruta responde 404 igual que con un id inexistente.
 */
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_ID ? id : null;
}

export function formatId(id: number): string {
  return String(id);
}
