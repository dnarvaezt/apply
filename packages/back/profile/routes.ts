import { access, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProfileFile, ProfileOrder } from "@apply/shared";
import { Hono } from "hono";
import { z } from "zod";
import { listFiles, mtime, removeFile, safeName } from "../storage.ts";
import { removeFromOrder, renameInOrder, sortProfileNames } from "./order.ts";

export interface ProfileRoutesDeps {
  dir: string;
}

const EXT = ".md";
/** Empieza por punto: `listFiles(".md")` no lo lista y `safeName` nunca produce ese nombre. */
const ORDER_FILE = ".order.json";
const DEFAULT_ORDER: ProfileOrder = { mode: "alpha", order: [] };

const orderSchema = z.object({
  mode: z.enum(["custom", "alpha"]),
  order: z.array(z.string()),
});
const renameSchema = z.object({ to: z.string().trim().min(1) });

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

/** Archivos Markdown del perfil (la base del RAG), su orden y su nombre. */
export function profileRoutes({ dir }: ProfileRoutesDeps) {
  const orderFile = path.join(dir, ORDER_FILE);

  async function readOrder(): Promise<ProfileOrder> {
    const raw = await readFile(orderFile, "utf8").catch(() => null);
    if (raw === null) return DEFAULT_ORDER;
    const parsed = orderSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_ORDER;
  }
  const writeOrder = (order: ProfileOrder) => writeFile(orderFile, JSON.stringify(order), "utf8");

  /** El nombre seguro con `.md`, o `null` si no es válido. */
  const toFileName = (name: string) => {
    try {
      return safeName(name, EXT);
    } catch {
      return null;
    }
  };

  return new Hono()
    .get("/profile", async (c) => {
      const names = sortProfileNames(await listFiles(dir, EXT), await readOrder());
      const out: ProfileFile[] = [];
      for (const name of names) {
        const file = path.join(dir, name);
        out.push({
          name,
          content: await readFile(file, "utf8"),
          updatedAt: new Date(await mtime(file)).toISOString(),
        });
      }
      return c.json(out);
    })

    .get("/profile-order", async (c) => c.json(await readOrder()))

    .put("/profile-order", async (c) => {
      const parsed = orderSchema.safeParse(await c.req.json().catch(() => undefined));
      if (!parsed.success) return c.json({ error: z.prettifyError(parsed.error) }, 400);
      await writeOrder(parsed.data);
      return c.json(parsed.data);
    })

    .put("/profile/:name", async (c) => {
      const name = safeName(c.req.param("name"), EXT);
      const { content } = await c.req.json<{ content: string }>();
      await writeFile(path.join(dir, name), content, "utf8");
      return c.json({ name });
    })

    .post("/profile/:name/rename", async (c) => {
      const body = renameSchema.safeParse(await c.req.json().catch(() => undefined));
      const from = toFileName(c.req.param("name"));
      const to = body.success ? toFileName(body.data.to) : null;
      if (!from || !to) return c.json({ error: "Nombre de archivo inválido" }, 400);
      if (!(await exists(path.join(dir, from)))) {
        return c.json({ error: "Archivo no encontrado" }, 404);
      }
      if (from === to) return c.json({ name: to });
      if (await exists(path.join(dir, to))) {
        return c.json({ error: `Ya existe un archivo llamado ${to}` }, 409);
      }
      await rename(path.join(dir, from), path.join(dir, to));
      await writeOrder(renameInOrder(await readOrder(), from, to));
      return c.json({ name: to });
    })

    .delete("/profile/:name", async (c) => {
      const name = safeName(c.req.param("name"), EXT);
      await removeFile(path.join(dir, name));
      await writeOrder(removeFromOrder(await readOrder(), name));
      return c.json({ ok: true });
    });
}
