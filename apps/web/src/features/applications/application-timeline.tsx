import type { ApplicationEvent } from "@apply/shared";
import { Badge } from "@/components/ui/badge";
import { chronological, EVENT_LABEL, SOURCE_LABEL } from "./pipeline";

/** Línea de tiempo de una postulación (REQ-003): fecha, tipo, canal y origen. */
export function ApplicationTimeline({ events }: { events: ApplicationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l pl-4" data-id="application-timeline">
      {chronological(events).map((e) => (
        <li key={e.id} className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={e.occurredAt} className="font-mono text-xs text-muted-foreground">
              {e.occurredAt.slice(0, 10)}
            </time>
            <span className="font-medium">{EVENT_LABEL[e.type]}</span>
            <Badge variant="outline">{e.channel ?? "sin canal"}</Badge>
            <Badge variant="secondary">{SOURCE_LABEL[e.source]}</Badge>
          </div>
          {e.notes && <p className="text-muted-foreground">{e.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
