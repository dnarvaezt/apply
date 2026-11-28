import type { DiscardReason, VacancyStatus } from "@apply/shared";
import { Badge } from "@/components/ui/badge";
import { STATUS_TONE, type StatusTone, statusText } from "./process-labels";

const TONE_STYLE: Record<StatusTone, string> = {
  idle: "bg-muted text-muted-foreground",
  progress: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  negative: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/** Estado de la vacante con el color de su tono y, si se descartó, el motivo. */
export function VacancyStatusBadge({
  status,
  discardReason = null,
}: {
  status: VacancyStatus;
  discardReason?: DiscardReason | null;
}) {
  return (
    <Badge className={TONE_STYLE[STATUS_TONE[status]]} data-id="vacancy-status-badge">
      {statusText(status, discardReason)}
    </Badge>
  );
}
