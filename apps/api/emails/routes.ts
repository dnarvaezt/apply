import type { CvDoc, Vacancy } from "@apply/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { DraftedEmail } from "../llm.ts";
import { composeBody, resolveRecipient } from "./draft.ts";
import { type EmailDraftsRepository, NotDraftError } from "./repository.ts";

export interface EmailDraftRoutesDeps {
  repo: EmailDraftsRepository;
  getCv: (id: string) => Promise<CvDoc | null>;
  getVacancy: (id: string) => Promise<Vacancy | null>;
  /** Frontera externa: Claude redacta asunto y cuerpo (D7). */
  draft: (input: { vacancy: Vacancy; cvMarkdown: string }) => Promise<DraftedEmail>;
}

/** Vacío = sin destinatario a propósito (C7); lo demás debe ser un email. */
const recipient = z.union([z.literal(""), z.email()]);

const generateSchema = z.object({ to: recipient.nullish() });

const updateSchema = z.object({
  to: recipient,
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

async function parseBody<T>(c: Context, schema: z.ZodType<T>, empty: unknown): Promise<T | string> {
  const text = await c.req.text();
  let raw: unknown = empty;
  try {
    if (text.trim()) raw = JSON.parse(text);
  } catch {
    return "El cuerpo no es JSON válido";
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : z.prettifyError(parsed.error);
}

const NO_DRAFT = { error: "Borrador no encontrado" };
const NO_CV = { error: "CV no encontrado" };

export function emailDraftRoutes({ repo, getCv, getVacancy, draft }: EmailDraftRoutesDeps) {
  return (
    new Hono()
      /** `null` mientras el CV no tenga borrador: aún no se generó, no es un error. */
      .get("/cvs/:id/email-draft", async (c) => {
        const cv = await getCv(c.req.param("id"));
        if (!cv) return c.json(NO_CV, 404);
        return c.json(await repo.latestForCv(cv.id));
      })

      /** El LLM corre antes de escribir: si falla no queda un borrador vacío (REQ-006). */
      .post("/cvs/:id/email-draft", async (c) => {
        const body = await parseBody(c, generateSchema, {});
        if (typeof body === "string") return c.json({ error: body }, 400);
        const cv = await getCv(c.req.param("id"));
        if (!cv) return c.json(NO_CV, 404);
        const vacancy = cv.vacancyId === null ? null : await getVacancy(cv.vacancyId);
        if (!vacancy) return c.json({ error: "El CV no tiene vacante a la cual postular" }, 404);

        const email = await draft({ vacancy, cvMarkdown: cv.markdown });
        const saved = await repo.replaceForCv({
          cvId: cv.id,
          to: resolveRecipient(body.to, vacancy.rawText),
          subject: email.subject.trim(),
          body: composeBody(vacancy.language, vacancy.posterName, email.body),
          language: vacancy.language,
        });
        return c.json(saved, 201);
      })

      .put("/email-drafts/:id", async (c) => {
        const body = await parseBody(c, updateSchema, undefined);
        if (typeof body === "string") return c.json({ error: body }, 400);
        try {
          const saved = await repo.update(c.req.param("id"), { ...body, to: body.to || null });
          return saved ? c.json(saved) : c.json(NO_DRAFT, 404);
        } catch (err) {
          if (err instanceof NotDraftError) return c.json({ error: err.message }, 409);
          throw err;
        }
      })
  );
}
