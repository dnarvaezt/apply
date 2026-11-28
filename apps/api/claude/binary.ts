import { access, constants } from "node:fs/promises";
import path from "node:path";

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Si `bin` (ruta o nombre buscado en `pathEnv`) existe y es ejecutable; `/health` lo reporta. */
export async function claudeBinaryExists(bin: string, pathEnv: string): Promise<boolean> {
  if (bin.includes("/")) return isExecutable(bin);
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    if (await isExecutable(path.join(dir, bin))) return true;
  }
  return false;
}
