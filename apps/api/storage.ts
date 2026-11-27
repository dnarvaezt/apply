import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "./paths.ts";
import { PROFILE_TEMPLATES } from "./templates.ts";

export const DATA_DIR = resolveDataDir(process.env.CV_DATA_DIR);
export const PROFILE_DIR = path.join(DATA_DIR, "profile");

/** Crea el perfil con las plantillas si no tiene ningún `.md`; nunca pisa lo que ya existe. */
export async function ensureDataDirs(profileDir = PROFILE_DIR): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const existing = await listFiles(profileDir, ".md");
  if (existing.length === 0) {
    for (const [name, content] of Object.entries(PROFILE_TEMPLATES)) {
      await writeFile(path.join(profileDir, name), content, "utf8");
    }
  }
}

export async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith(ext)).sort();
  } catch {
    return [];
  }
}

export async function mtime(file: string): Promise<number> {
  return (await stat(file)).mtimeMs;
}

export async function removeFile(file: string): Promise<void> {
  await rm(file, { force: true });
}

/** Evita path traversal: solo nombres simples. */
export function safeName(name: string, ext: string): string {
  const base = path.basename(name).replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_");
  const withExt = base.endsWith(ext) ? base : `${base}${ext}`;
  if (withExt === ext || withExt.startsWith(".")) throw new Error("Nombre de archivo inválido");
  return withExt;
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
