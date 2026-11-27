import Anthropic from "@anthropic-ai/sdk";
import type { RetrievedChunk, Vacancy } from "@apply/shared";
import { z } from "zod";
import type { ClaudeImage } from "./claude/cli.ts";
import { runClaudeStructured } from "./claude/runner.ts";

/**
 * Solo `streamCv` usa todavía el SDK (se migra en #54). La extracción de la vacante y el correo
 * van por la CLI `claude -p` (ver claude/runner.ts).
 * Credenciales del SDK: ANTHROPIC_API_KEY (en .env) o un perfil de `ant auth login`.
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
  posterName: z
    .string()
    .nullable()
    .describe(
      "Nombre de la persona que publicó la vacante (p. ej. bajo 'Meet the hiring team' o 'Publicado por'); null si no aparece",
    ),
  posterTitle: z
    .string()
    .nullable()
    .describe(
      "Cargo de quien publicó la vacante (p. ej. 'Technical Recruiter'); null si no aparece",
    ),
  postedAtText: z
    .string()
    .nullable()
    .describe(
      "Fecha de publicación tal como aparece en el texto: relativa ('hace 3 días', '2 weeks ago') o completa en AAAA-MM-DD; null si no aparece",
    ),
});

export type ExtractedVacancy = z.infer<typeof VacancySchema>;

const VACANCY_SYSTEM =
  "Extraes información estructurada de ofertas de empleo. Sé fiel al texto: no inventes requisitos. " +
  "Divide requisitos compuestos en elementos atómicos (p. ej. 'React y TypeScript' → dos elementos). " +
  "Ignora texto irrelevante de la página (menús, cookies, otras ofertas). " +
  "Si un dato (quién publicó, su cargo, la fecha de publicación) no aparece, usa null: no lo deduzcas.";

/** La frontera es el binario `claude` local (`CLAUDE_BIN`); las pruebas usan un binario falso. */
export function extractVacancy(rawText: string): Promise<ExtractedVacancy> {
  return runClaudeStructured({
    schema: VacancySchema,
    system: VACANCY_SYSTEM,
    prompt: `<vacante>\n${rawText}\n</vacante>`,
    what: "la vacante estructurada",
  });
}

const ImageVacancySchema = VacancySchema.extend({
  transcription: z
    .string()
    .describe(
      "Transcripción fiel y completa del texto visible en la imagen; cadena vacía si no hay texto legible",
    ),
});

export type ExtractedImageVacancy = z.infer<typeof ImageVacancySchema>;

const IMAGE_PROMPT =
  "La imagen adjunta es una captura de una oferta de empleo. Transcribe todo su texto en `transcription` " +
  "sin resumir ni inventar, y extrae los demás campos de esa transcripción. " +
  "Si la imagen no contiene texto legible de una vacante, `transcription` es una cadena vacía.";

/** Una sola llamada a la CLI: transcribe la imagen y extrae los campos (REQ-002 de #55). */
export function extractVacancyFromImage(image: ClaudeImage): Promise<ExtractedImageVacancy> {
  return runClaudeStructured({
    schema: ImageVacancySchema,
    system: VACANCY_SYSTEM,
    prompt: IMAGE_PROMPT,
    what: "la vacante estructurada",
    image,
  });
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

const EmailSchema = z.object({
  subject: z.string().min(1).describe("Asunto del correo: el puesto y el nombre del candidato"),
  body: z
    .string()
    .min(1)
    .describe(
      "Cuerpo del correo SIN saludo inicial: empieza en el primer párrafo y cierra con la firma",
    ),
  language: z.enum(["es", "en"]).describe("Idioma en que está escrito el correo"),
});

export type DraftedEmail = z.infer<typeof EmailSchema>;

const EMAIL_SYSTEM = `Redactas el correo con el que un candidato envía su CV a una vacante.
- Usa solo hechos del CV entregado: no inventes experiencia, cifras ni datos de contacto.
- 2-3 párrafos breves: por qué el rol, qué del CV encaja con los requisitos obligatorios, cierre con disponibilidad para conversar y mención del CV adjunto.
- No escribas el saludo inicial (se agrega aparte con el nombre de quien publicó la vacante). Cierra con la firma usando el nombre del CV.
- Escribe en el idioma indicado; el campo language debe ser ese idioma.`;

/** Borrador del correo de postulación (D7): salida estructurada de `claude -p`, validada con zod. */
export async function draftApplicationEmail(input: {
  vacancy: Vacancy;
  cvMarkdown: string;
}): Promise<DraftedEmail> {
  const { vacancy } = input;
  const email = await runClaudeStructured({
    schema: EmailSchema,
    system: EMAIL_SYSTEM,
    prompt: [
      `<vacante>\n${formatVacancy(vacancy)}\n</vacante>`,
      `Quien publicó la vacante: ${vacancy.posterName ?? "desconocido"}`,
      `<cv>\n${input.cvMarkdown}\n</cv>`,
      `Idioma del correo: ${vacancy.language}`,
    ].join("\n\n"),
    what: "el correo estructurado",
  });
  if (email.language !== vacancy.language) {
    throw new Error(`El correo llegó en otro idioma (${email.language}) que la vacante.`);
  }
  return email;
}
