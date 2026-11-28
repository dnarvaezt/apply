import type { ProfileOrder } from "@apply/shared";

const byName = (a: string, b: string) =>
  a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/** Ordena los nombres según el modo: el orden manual primero; lo que no figura en él va al final, alfabético. */
export function sortProfileNames(names: string[], { mode, order }: ProfileOrder): string[] {
  const alpha = [...names].sort(byName);
  if (mode === "alpha") return alpha;
  const present = new Set(names);
  const placed = order.filter((n) => present.has(n));
  const placedSet = new Set(placed);
  return [...placed, ...alpha.filter((n) => !placedSet.has(n))];
}

/** El orden tras renombrar `from` a `to`: el archivo conserva su posición. */
export const renameInOrder = (order: ProfileOrder, from: string, to: string): ProfileOrder => ({
  ...order,
  order: order.order.map((n) => (n === from ? to : n)),
});

export const removeFromOrder = (order: ProfileOrder, name: string): ProfileOrder => ({
  ...order,
  order: order.order.filter((n) => n !== name),
});
