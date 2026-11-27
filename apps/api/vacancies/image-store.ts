import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClaudeImage } from "../claude/cli.ts";
import { parseId } from "../ids.ts";
import { imageFileName, VACANCY_IMAGE_TYPES } from "./image.ts";

export interface StoredImage {
  mediaType: ClaudeImage["mediaType"];
  bytes: Buffer;
}

/**
 * Imágenes originales de las vacantes en `dir/<id>.<ext>`. La ruta se deriva solo de un id
 * numérico validado con `parseId`, así que ningún id de la URL puede salir de `dir`.
 */
export function createImageStore(dir: string) {
  return {
    async save(id: string, image: ClaudeImage): Promise<void> {
      const numeric = parseId(id);
      if (numeric === null) throw new Error(`Id de vacante inválido: ${id}`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, imageFileName(numeric, image.mediaType)),
        Buffer.from(image.data, "base64"),
      );
    },

    /** `null` si el id no es válido o la vacante no tiene imagen. */
    async read(id: string): Promise<StoredImage | null> {
      const numeric = parseId(id);
      if (numeric === null) return null;
      for (const mediaType of VACANCY_IMAGE_TYPES) {
        try {
          return {
            mediaType,
            bytes: await readFile(path.join(dir, imageFileName(numeric, mediaType))),
          };
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      return null;
    },

    /** Idempotente: sin archivo o con un id inválido no hace nada. */
    async remove(id: string): Promise<void> {
      const numeric = parseId(id);
      if (numeric === null) return;
      for (const mediaType of VACANCY_IMAGE_TYPES) {
        await rm(path.join(dir, imageFileName(numeric, mediaType)), { force: true });
      }
    },
  };
}

export type ImageStore = ReturnType<typeof createImageStore>;
