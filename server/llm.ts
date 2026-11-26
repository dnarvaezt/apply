import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RetrievedChunk, Vacancy } from "../shared/types.ts";

/**
 * Credenciales: ANTHROPIC_API_KEY (en .env) o un perfil de `ant auth login`.
 * Fallbacks del lado del servidor activados: si el modelo rechaza por política,
 * la API reintenta automáticamente con el modelo de respaldo por defecto.
 */
const client = new Anthropic();
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];

const VacancySchema = z.object({
  title: z.string().describe("Título del puesto"),
  company: z.string().describe("Empresa; 'Confidencial' si no aparece"),
  location: z.string().nullable().describe("Ubicación / modalidad (remoto, híbrido...)"),
  seniority: z.string().nullable().describe("Junior, Mid, Senior, Lead..."),
  language: z.enum(["es", "en"]).describe("Idioma en que está escrita la vacante"),
  summary: z.string().describe("Resumen de 2-3 frases del rol"),
  mustHave: z.array(z.string()).describe("Requisitos obligatorios, uno por elemento, concretos"),
  niceToHave: z.array(z.string()).describe("Requisitos deseables / plus"),
  responsibilities: z.array(z.string()).describe("Responsabilidades principales"),
  keywords: z
    .array(z.string())
    .describe("Palabras clave ATS: tecnologías, herramientas, metodologías, certificaciones"),
});

export type ExtractedVacancy = z.infer<typeof VacancySchema>;

export async function extractVacancy(rawText: string): Promise<ExtractedVacancy> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(VacancySchema) },
    system:
      "Extraes información estructurada de ofertas de empleo. Sé fiel al texto: no inventes requisitos. " +
      "Divide requisitos compuestos en elementos atómicos (p. ej. 'React y TypeScript' → dos elementos). " +
      "Ignora texto irrelevante de la página (menús, cookies, otras ofertas).",
    messages: [{ role: "user", content: `<vacante>\n${rawText}\n</vacante>` }],
  });
  if (response.stop_reason === "refusal") throw new Error("El modelo rechazó procesar la vacante.");
  if (!response.parsed_output) throw new Error("No se pudo interpretar la vacante.");
  return response.parsed_output;
}

const CV_SYSTEM = `Eres un experto en redacción de CVs y sistemas ATS. Escribes un CV en Markdown adaptado a una vacante concreta, usando EXCLUSIVAMENTE la información del perfil del candidato que se te entrega (fragmentos recuperados de su base de conocimiento).

Reglas de veracidad (las más importantes):
- Nunca inventes empleadores, cargos, fechas, métricas, títulos, certificaciones, tecnologías ni logros. Si algo no está en el perfil, no existe.
- Si la vacante pide algo que el perfil no cubre, no lo afirmes. Puedes destacar experiencia relacionada o transferible que sí esté en el perfil.
- Puedes reformular, resumir, reordenar y elegir qué incluir. Puedes usar la terminología de la vacante cuando describa con verdad lo que el candidato hizo (p. ej. el perfil dice "Postgres" y la vacante "PostgreSQL").

Adaptación:
- Escribe en el idioma de la vacante.
- El resumen profesional (3-4 líneas) conecta directamente el perfil con el rol y su seniority.
- Prioriza lo que más se alinea con los requisitos obligatorios; luego deseables. Ordena las viñetas de cada puesto por relevancia para la vacante.
- Viñetas con verbo de acción + qué + resultado/métrica cuando el perfil la tenga. Máximo 5 viñetas por puesto; los puestos antiguos o poco relevantes, 1-2 viñetas.
- Incluye las palabras clave ATS de la vacante que el candidato realmente tiene.
- Extensión objetivo: 1 página, máximo 2.

Formato (Markdown estricto, se convierte a PDF):
- Línea 1: "# Nombre Completo". Deja una línea en blanco entre la línea 1, la 2 y la 3 (son párrafos separados).
- Línea 2: el título profesional adaptado a la vacante en negrita.
- Línea 3: datos de contacto en una sola línea separados por " · " (los links como [texto](url)).
- Secciones con "## ": Resumen, Habilidades, Experiencia, Proyectos, Educación, Certificaciones, Idiomas (traducidas al idioma de la vacante). Omite las que no tengan contenido relevante.
- En Experiencia, cada puesto como "### Cargo — Empresa" seguido de una línea en cursiva con fechas y ubicación si existen, y luego viñetas.
- Habilidades agrupadas por categoría en viñetas: "- **Categoría:** a, b, c".
- Sin tablas, sin HTML, sin imágenes, sin emojis.
- Responde SOLO con el Markdown del CV: sin bloques de código, sin comentarios antes ni después.`;

function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `<fragmento archivo="${c.file}" seccion="${c.heading.replaceAll('"', "'")}">\n${c.text}\n</fragmento>`,
    )
    .join("\n");
}

function formatVacancy(v: Vacancy): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n") || "- (ninguno)";
  return `Puesto: ${v.title}
Empresa: ${v.company}
Ubicación: ${v.location ?? "-"}
Seniority: ${v.seniority ?? "-"}
Idioma: ${v.language}
Resumen: ${v.summary}

Requisitos obligatorios:
${list(v.mustHave)}

Deseables:
${list(v.niceToHave)}

Responsabilidades:
${list(v.responsibilities)}

Palabras clave: ${v.keywords.join(", ")}

Texto original:
${v.rawText}`;
}

export async function* streamCv(
  vacancy: Vacancy,
  chunks: RetrievedChunk[],
  instructions?: string,
): AsyncGenerator<string> {
  const userContent = [
    `<perfil_candidato>\n${formatContext(chunks)}\n</perfil_candidato>`,
    `<vacante>\n${formatVacancy(vacancy)}\n</vacante>`,
    instructions?.trim()
      ? `<instrucciones_adicionales>\n${instructions.trim()}\n</instrucciones_adicionales>`
      : "",
    "Escribe el CV adaptado a esta vacante.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "high" },
    system: CV_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new Error("El modelo rechazó generar el CV.");
  if (final.stop_reason === "max_tokens") throw new Error("La respuesta se cortó por longitud.");
}

/** Por si el modelo envuelve la respuesta en ```markdown ... ``` */
export function cleanMarkdown(md: string): string {
  return md
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
}
