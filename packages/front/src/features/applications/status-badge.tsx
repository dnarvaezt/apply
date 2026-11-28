import type { ApplicationStatus } from "@apply/shared";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE, type StatusTone } from "./pipeline";

const TONE_STYLE: Record<StatusTone, string> = {
  progress: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/** Estado de la postulación con el color de su tono: en curso, buen o mal final. */
export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge className={TONE_STYLE[STATUS_TONE[status]]}>{STATUS_LABEL[status]}</Badge>;
}
