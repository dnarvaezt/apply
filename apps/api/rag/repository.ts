import { profileChunks } from "@apply/db";
import { and, asc, cosineDistance, count, eq, inArray, like, max, sql } from "drizzle-orm";
import type { Db } from "../db.ts";
import type { Chunk } from "./chunk.ts";
import { ALWAYS_PREFIX, fromContent, toContent } from "./match.ts";

export interface StoredSource {
  path: string;
  hash: string;
  model: string;
}

export interface FileChunks {
  path: string;
  hash: string;
  mtime: Date;
  chunks: (Chunk & { vector: number[] })[];
}

const chunkColumns = {
  path: profileChunks.sourcePath,
  index: profileChunks.chunkIndex,
  content: profileChunks.content,
};

function toChunk(row: { path: string; index: number; content: string }): Chunk {
  return { id: `${row.path}#${row.index}`, file: row.path, ...fromContent(row.content) };
}

/** Fragmentos del perfil en `profile_chunks` (D2): un archivo = un grupo de filas con su hash. */
export function createProfileChunksRepository(db: Db) {
  /** Un registro por archivo indexado (hash y modelo de su primera fila). */
  async function sources(): Promise<StoredSource[]> {
    const rows = await db
      .selectDistinctOn([profileChunks.sourcePath, profileChunks.embedModel], {
        path: profileChunks.sourcePath,
        hash: profileChunks.sourceHash,
        model: profileChunks.embedModel,
      })
      .from(profileChunks)
      .orderBy(asc(profileChunks.sourcePath), asc(profileChunks.embedModel));
    return rows;
  }

  async function summary(): Promise<{ chunks: number; builtAt: Date | null }> {
    const [row] = await db
      .select({ chunks: count(), builtAt: max(profileChunks.createdAt) })
      .from(profileChunks);
    return { chunks: row?.chunks ?? 0, builtAt: row?.builtAt ?? null };
  }

  /** Reemplaza en una transacción las filas de los archivos dados y borra las de `removed`. */
  async function replace(files: FileChunks[], removed: string[], model: string): Promise<void> {
    const paths = [...removed, ...files.map((f) => f.path)];
    if (paths.length === 0) return;
    await db.transaction(async (tx) => {
      await tx.delete(profileChunks).where(inArray(profileChunks.sourcePath, paths));
      const values = files.flatMap((f) =>
        f.chunks.map((c, i) => ({
          sourcePath: f.path,
          sourceHash: f.hash,
          sourceMtime: f.mtime,
          chunkIndex: i,
          content: toContent(c),
          embedding: c.vector,
          embedModel: model,
        })),
      );
      if (values.length > 0) await tx.insert(profileChunks).values(values);
    });
  }

  /** Búsqueda exacta por similitud coseno en pgvector, sobre todos los fragmentos del modelo. */
  async function similar(
    vector: number[],
    model: string,
  ): Promise<{ chunk: Chunk; sem: number }[]> {
    const distance = cosineDistance(profileChunks.embedding, vector);
    const rows = await db
      .select({ ...chunkColumns, sem: sql<number>`1 - (${distance})`.mapWith(Number) })
      .from(profileChunks)
      .where(eq(profileChunks.embedModel, model))
      .orderBy(distance);
    return rows.map((r) => ({ chunk: toChunk(r), sem: r.sem }));
  }

  /** Fragmentos de los archivos `00-`, que siempre van al contexto. */
  async function always(model: string): Promise<Chunk[]> {
    const rows = await db
      .select(chunkColumns)
      .from(profileChunks)
      .where(
        and(
          like(profileChunks.sourcePath, `${ALWAYS_PREFIX}%`),
          eq(profileChunks.embedModel, model),
        ),
      )
      .orderBy(asc(profileChunks.sourcePath), asc(profileChunks.chunkIndex));
    return rows.map(toChunk);
  }

  return { sources, summary, replace, similar, always };
}
