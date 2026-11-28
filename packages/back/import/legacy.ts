import { z } from "zod";
import { detectPlatform } from "../vacancies/platform.ts";
import type { NewVacancy } from "../vacancies/repository.ts";

const isoDate = z.iso.datetime({ offset: true });
const legacyId = z.string().min(1);

/** Vacante como la escribía la versión en archivos (`data/vacancies/<id>.json`). */
const legacyVacancySchema = z.object({
  id: legacyId,
  createdAt: isoDate,
  sourceUrl: z.string().nullable(),
  rawText: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  seniority: z.string().nullable(),
  language: z.enum(["es", "en"]),
  summary: z.string(),
  mustHave: z.array(z.string()),
  niceToHave: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
});

/** Metadatos del CV (`data/cvs/<id>.json`); el markdown va aparte en `<id>.md`. */
const legacyCvMetaSchema = z.object({
  id: legacyId,
  vacancyId: legacyId.nullable(),
  title: z.string(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type LegacyVacancy = z.infer<typeof legacyVacancySchema>;
export type LegacyCvMeta = z.infer<typeof legacyCvMetaSchema>;

function parseWith<T>(schema: z.ZodType<T>, text: string): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON inválido: ${(error as Error).message}`);
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
}

export const parseLegacyVacancy = (text: string) => parseWith(legacyVacancySchema, text);
export const parseLegacyCvMeta = (text: string) => parseWith(legacyCvMetaSchema, text);

/** Los archivos no guardaban publicador ni fecha de publicación: quedan desconocidos. */
export function legacyVacancyToNew(v: LegacyVacancy): {
  legacyId: string;
  createdAt: Date;
  input: NewVacancy;
} {
  const { id, createdAt, ...fields } = v;
  return {
    legacyId: id,
    createdAt: new Date(createdAt),
    input: {
      ...fields,
      platform: detectPlatform(v.sourceUrl, v.rawText),
      posterName: null,
      posterTitle: null,
      posterProfileUrl: null,
      postedAt: null,
      postedAtPrecision: "unknown",
    },
  };
}
