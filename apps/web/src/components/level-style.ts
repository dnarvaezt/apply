import type { MatchLevel } from "@apply/shared";

/** Color de la insignia de cada nivel de match, igual en la vacante y en el CV. */
export const LEVEL_STYLE: Record<MatchLevel, string> = {
  fuerte: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  débil: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};
