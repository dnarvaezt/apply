import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "./paths.ts";
import { PROFILE_TEMPLATES } from "./templates.ts";

export const DATA_DIR = resolveDataDir(process.env.CV_DATA_DIR);
export const PROFILE_DIR = path.join(DATA_DIR, "profile");
export const VACANCIES_DIR = path.join(DATA_DIR, "vacancies");
export const CVS_DIR = path.join(DATA_DIR, "cvs");
export const INDEX_FILE = path.join(DATA_DIR, "index.json");

export async function ensureDataDirs(): Promise<void> {
  for (const dir of [PROFILE_DIR, VACANCIES_DIR, CVS_DIR]) {
    await mkdir(dir, { recursive: true });
  }
  const existing = await listFiles(PROFILE_DIR, ".md");
  if (existing.length === 0) {
    for (const [name, content] of Object.entries(PROFILE_TEMPLATES)) {
      await writeFile(path.join(PROFILE_DIR, name), content, "utf8");
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

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
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

export function newId(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${stamp}-${prefix}-${Math.random().toString(36).slice(2, 8)}`;
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
