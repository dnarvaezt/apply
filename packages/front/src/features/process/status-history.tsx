import type { Channel, StatusChange } from "@apply/shared";
import { ArrowRight } from "lucide-react";
import { channelLabel } from "@/features/applications/pipeline";
import { STATUS_LABEL, statusText } from "./process-labels";

const formatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/** Historial de cambios de estado, del más reciente al más antiguo, con su nota. */
export function StatusHistory({
  history,
  channels,
}: {
  history: StatusChange[];
  channels: Channel[];
}) {
  return (
    <section
      className="flex flex-col gap-3"
      data-id="status-history"
      aria-labelledby="history-title"
    >
      <h3 id="history-title" className="font-medium">
        Historial
      </h3>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin cambios todavía: la vacante sigue en «{STATUS_LABEL.to_apply}».
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-id="status-history__list">
          {history.map((change) => (
            <li
              key={change.id}
              className="rounded-lg border p-3 text-sm"
              data-id="status-history__item"
            >
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {change.from && (
                  <>
                    <span className="text-muted-foreground">{STATUS_LABEL[change.from]}</span>
                    <ArrowRight className="size-3.5" aria-label="a" />
                  </>
                )}
                <span>{statusText(change.to, change.discardReason)}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={change.occurredAt}>
                  {formatter.format(new Date(change.occurredAt))}
                </time>
                {change.channel && ` · ${channelLabel(channels, change.channel)}`}
                {change.source === "auto" && " · automático"}
              </p>
              {change.note && <p className="mt-1 whitespace-pre-wrap">{change.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
