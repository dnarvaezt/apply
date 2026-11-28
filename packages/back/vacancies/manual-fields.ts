import { z } from "zod";
import { isHttpUrl } from "./http-url.ts";
import { parseAbsoluteDate } from "./posted-at.ts";

/** Campos que el usuario escribe a mano; prevalecen sobre los extraídos (REQ-005). */
export interface ManualFields {
  posterName?: string | null;
  posterTitle?: string | null;
  posterProfileUrl?: string | null;
  postedAt?: Date | null;
}

/** Lo que el usuario corrige al editar la vacante (#73): los campos manuales y los extraídos. */
export interface VacancyChanges extends ManualFields {
  title?: string;
  company?: string;
  location?: string | null;
  seniority?: string | null;
  summary?: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export type ParsedManualFields = Parsed<ManualFields>;

/** Texto recortado; vacío o `null` → `null` (borra el campo). */
const blankToNull = (text: z.ZodString) =>
  z.union([text, z.null()]).transform((v) => (v === null ? null : v.trim() || null));

const optionalText = blankToNull(z.string().max(200));

const profileUrl = blankToNull(z.string()).refine((v) => v === null || isHttpUrl(v), {
  message: "posterProfileUrl debe ser una URL http o https",
});

const postedAt = blankToNull(z.string()).transform((v, ctx) => {
  if (v === null) return null;
  const date = parseAbsoluteDate(v);
  if (!date)
    ctx.addIssue({ code: "custom", message: "postedAt debe ser una fecha válida (AAAA-MM-DD)" });
  return date;
});

const requiredText = (message: string) => z.string().trim().min(1, message).max(200);

const manualShape = {
  posterName: optionalText.optional(),
  posterTitle: optionalText.optional(),
  posterProfileUrl: profileUrl.optional(),
  postedAt: postedAt.optional(),
};

const schema = z.object(manualShape);

const changesSchema = z.object({
  ...manualShape,
  title: requiredText("El título no puede estar vacío").optional(),
  company: requiredText("La empresa no puede estar vacía").optional(),
  location: optionalText.optional(),
  seniority: optionalText.optional(),
  summary: z.string().max(4000).trim().optional(),
});

function parseWith<T>(target: z.ZodType<T>, input: unknown): Parsed<T> {
  const parsed = target.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Campos inválidos" };
  }
  return { ok: true, value: parsed.data };
}

/** Valida y normaliza los campos manuales; los ausentes quedan fuera (no se tocan). */
export function parseManualFields(input: unknown): ParsedManualFields {
  return parseWith(schema, input);
}

/** Valida la edición de la vacante (`PATCH`): campos manuales más título, empresa y resumen. */
export function parseVacancyChanges(input: unknown): Parsed<VacancyChanges> {
  return parseWith(changesSchema, input);
}
