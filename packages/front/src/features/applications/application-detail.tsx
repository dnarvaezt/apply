import type {
  AddEventRequest,
  Channel,
  ContactInput,
  NewApplicationContactRequest,
  ApplicationTimeline as Timeline,
} from "@apply/shared";
import { ApplicationTimeline } from "./application-timeline";
import { ContactsPanel } from "./contacts-panel";
import { EventForm } from "./event-form";
import { StatusStepper } from "./status-stepper";

/** Detalle de la postulación elegida: estado, eventos, registro manual y contactos. */
export function ApplicationDetail({
  timeline,
  channels,
  onAddEvent,
  onAddContact,
  onUpdateContact,
  onMarkProcessStart,
}: {
  timeline: Timeline;
  channels: Channel[];
  onAddEvent: (req: AddEventRequest) => Promise<boolean>;
  onAddContact: (req: NewApplicationContactRequest) => Promise<boolean>;
  onUpdateContact: (id: string, input: ContactInput) => Promise<boolean>;
  onMarkProcessStart: (id: string, isProcessStart: boolean) => Promise<void>;
}) {
  const { application, events, contacts } = timeline;
  return (
    <div
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      data-id="application-detail"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <StatusStepper status={application.status} events={events} />
        <ApplicationTimeline events={events} channels={channels} contacts={contacts} />
      </div>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="event-form-title">
          <h3 id="event-form-title" className="font-medium">
            Registrar lo que pasó
          </h3>
          <EventForm channels={channels} contacts={contacts} onSubmit={onAddEvent} />
        </section>
        <ContactsPanel
          contacts={contacts}
          onAdd={onAddContact}
          onUpdate={onUpdateContact}
          onMarkProcessStart={onMarkProcessStart}
        />
      </div>
    </div>
  );
}
