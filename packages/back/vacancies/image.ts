import type { ClaudeImage } from "../claude/cli.ts";

/** Tipos permitidos y la extensión con la que se guarda cada uno. */
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export const VACANCY_IMAGE_TYPES = Object.keys(EXTENSIONS) as ClaudeImage["mediaType"][];
const MEDIA_TYPES: readonly string[] = VACANCY_IMAGE_TYPES;

/** Nombre del archivo de una imagen de vacante: `<id numérico>.<ext>`. */
export function imageFileName(id: number, mediaType: ClaudeImage["mediaType"]): string {
  return `${id}.${EXTENSIONS[mediaType]}`;
}
/** Supuesto declarado, no verificado contra la CLI: el stdin de la CLI admite 10 MB y el base64 pesa 4/3. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Tope del body de `POST /vacancies`: la imagen en base64 más sus campos. */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type ImageResult =
  | { ok: true; value: ClaudeImage }
  | { ok: false; status: 400 | 413; error: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const bad = (error: string): ImageResult => ({ ok: false, status: 400, error });

/** Valida `image: { mediaType, data }` del body sin tocar la CLI: tipo, base64 y tamaño decodificado. */
export function parseVacancyImage(raw: unknown): ImageResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return bad("La imagen debe ser un objeto { mediaType, data }");
  }
  const { mediaType, data } = raw as { mediaType?: unknown; data?: unknown };
  if (typeof mediaType !== "string" || !MEDIA_TYPES.includes(mediaType)) {
    return bad("La imagen debe ser PNG, JPEG o WebP");
  }
  if (typeof data !== "string" || data === "" || !BASE64.test(data) || data.length % 4 !== 0) {
    return bad("La imagen no es base64 válido");
  }
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  if ((data.length / 4) * 3 - padding > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `La imagen pesa más de ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
    };
  }
  return { ok: true, value: { mediaType: mediaType as ClaudeImage["mediaType"], data } };
}
