export interface Chunk {
  id: string;
  file: string;
  heading: string;
  text: string;
}

const MAX_CHARS = 1400;

/**
 * Divide un markdown en secciones por encabezados. Cada sección conserva la ruta
 * de encabezados ("Experiencia > Empresa X") para que el modelo tenga contexto.
 * Las secciones largas se parten por párrafos/viñetas repitiendo el encabezado.
 */
export function chunkMarkdown(file: string, markdown: string): Chunk[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const stack: string[] = [];
  const sections: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } = { heading: "", body: [] };

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      sections.push(current);
      const level = match[1].length;
      stack.length = level - 1;
      stack[level - 1] = match[2].trim();
      current = { heading: stack.filter(Boolean).join(" > "), body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push(current);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const body = section.body.join("\n").trim();
    if (!body) continue;
    for (const piece of splitLong(body)) {
      chunks.push({
        id: `${file}#${chunks.length}`,
        file,
        heading: section.heading || file,
        text: piece,
      });
    }
  }
  return chunks;
}

function splitLong(body: string): string[] {
  if (body.length <= MAX_CHARS) return [body];
  const blocks = body.split(/\n(?=\s*[-*+]\s|\s*\d+\.\s|\n)/);
  const out: string[] = [];
  let buf = "";
  for (const block of blocks) {
    if (buf && buf.length + block.length > MAX_CHARS) {
      out.push(buf.trim());
      buf = "";
    }
    buf += `${block}\n`;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
