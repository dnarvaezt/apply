import { z } from "zod";
import { parseAbsoluteDate } from "./posted-at.ts";

/** Campos que el usuario escribe a mano; prevalecen sobre los extraídos (REQ-005). */
export interface ManualFields {
  posterName?: string | null;
  posterTitle?: string | null;
  posterProfileUrl?: string | null;
  postedAt?: Date | null;
}

export type ParsedManualFields = { ok: true; value: ManualFields } | { ok: false; error: string };

/** Texto recortado; vacío o `null` → `null` (borra el campo). */
const blankToNull = (text: z.ZodString) =>
  z.union([text, z.null()]).transform((v) => (v === null ? null : v.trim() || null));

const optionalText = blankToNull(z.string().max(200));

/** Solo http/https (REQ-007): `javascript:`, `data:`, `file:` y similares se rechazan. */
const profileUrl = blankToNull(z.string()).refine(
  (v) => {
    if (v === null) return true;
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  },
  { message: "posterProfileUrl debe ser una URL http o https" },
);

const postedAt = blankToNull(z.string()).transform((v, ctx) => {
  if (v === null) return null;
  const date = parseAbsoluteDate(v);
  if (!date)
    ctx.addIssue({ code: "custom", message: "postedAt debe ser una fecha válida (AAAA-MM-DD)" });
  return date;
});

const schema = z.object({
  posterName: optionalText.optional(),
  posterTitle: optionalText.optional(),
  posterProfileUrl: profileUrl.optional(),
  postedAt: postedAt.optional(),
});

/** Valida y normaliza los campos manuales; los ausentes quedan fuera (no se tocan). */
export function parseManualFields(input: unknown): ParsedManualFields {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Campos inválidos" };
  }
  return { ok: true, value: parsed.data };
}
