import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const TOKEN_FILE = "gmail-tokens.json";

const storedSchema = z.object({
  refreshToken: z.string().min(1),
  email: z.string().nullable(),
  reauthRequired: z.boolean(),
});

export type StoredTokens = z.infer<typeof storedSchema>;

const isMissing = (e: unknown) => z.object({ code: z.literal("ENOENT") }).safeParse(e).success;

/** Archivo de tokens con permisos 0600 en una carpeta 0700 (REQ-003). Nunca se loguea. */
export function createTokenStore(dir: string) {
  const file = path.join(dir, TOKEN_FILE);

  async function read(): Promise<StoredTokens | null> {
    try {
      return storedSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }

  /** Escribe en un temporal 0600 y lo renombra: un corte nunca deja el archivo a medias. */
  async function write(tokens: StoredTokens): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(storedSchema.parse(tokens)), { mode: 0o600 });
    await rename(tmp, file);
  }

  return { file, read, write };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
