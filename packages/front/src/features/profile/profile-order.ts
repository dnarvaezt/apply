/** Mueve `name` una posición (`-1` arriba, `1` abajo); en el borde la lista queda igual. */
export function moveName(names: string[], name: string, delta: -1 | 1): string[] {
  const from = names.indexOf(name);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= names.length) return names;
  const next = [...names];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** El nombre sin `.md`: es lo que se edita; la extensión la pone el servidor. */
export const baseName = (name: string) => name.replace(/\.md$/, "");
