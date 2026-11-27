import type { ApplicationContact, ApplicationEvent, Channel } from "@apply/shared";
import { Badge } from "@/components/ui/badge";
import { channelLabel, chronological, EVENT_LABEL, SOURCE_LABEL } from "./pipeline";

/** Línea de tiempo de una postulación (REQ-003): fecha, tipo, canal, origen y contacto. */
export function ApplicationTimeline({
  events,
  channels,
  contacts,
}: {
  events: ApplicationEvent[];
  channels: Channel[];
  contacts: Pick<ApplicationContact, "id" | "name">[];
}) {
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>;
  }
  return (
    <ol className="flex flex-col gap-3 border-l pl-4" data-id="application-timeline">
      {chronological(events).map((e) => (
        <li
          key={e.id}
          className="flex flex-col gap-1 text-sm"
          data-id="application-timeline__event"
        >
          <div className="flex flex-wrap items-center gap-2">
            <time dateTime={e.occurredAt} className="font-mono text-xs text-muted-foreground">
              {e.occurredAt.slice(0, 10)}
            </time>
            <span className="font-medium">{EVENT_LABEL[e.type]}</span>
            <Badge variant="outline">{channelLabel(channels, e.channel)}</Badge>
            <Badge variant="secondary">{SOURCE_LABEL[e.source]}</Badge>
          </div>
          {e.contactId && contactName.has(e.contactId) && (
            <p className="text-muted-foreground">con {contactName.get(e.contactId)}</p>
          )}
          {e.notes && <p className="text-muted-foreground">{e.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
