import type {
  AddEventRequest,
  ApplicationContact,
  ApplicationEventType,
  Channel,
} from "@apply/shared";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChannelField, OccurredAtField } from "./event-fields";
import { EVENT_GROUPS, EVENT_LABEL, localInputToIso } from "./pipeline";
import { SelectField } from "./select-field";

/** Registra a mano un evento de la postulación con su canal, fecha y contacto (REQ-003). */
export function EventForm({
  channels,
  contacts,
  onSubmit,
}: {
  channels: Channel[];
  contacts: Pick<ApplicationContact, "id" | "name">[];
  /** Resuelve `true` si el evento quedó registrado. */
  onSubmit: (req: AddEventRequest) => Promise<boolean>;
}) {
  const [type, setType] = useState<ApplicationEventType>("contacted");
  const [channel, setChannel] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const saved = await onSubmit({
      type,
      source: "manual",
      channel: channel || null,
      occurredAt: localInputToIso(occurredAt),
      contactId: contactId || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (saved) {
      setOccurredAt("");
      setContactId("");
      setNotes("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-id="event-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="event-type"
          label="Tipo"
          value={type}
          onChange={(v) => setType(v as ApplicationEventType)}
        >
          {EVENT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.types.map((t) => (
                <option key={t} value={t}>
                  {EVENT_LABEL[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <ChannelField
          id="event-channel"
          channels={channels}
          value={channel}
          onChange={setChannel}
        />
        <OccurredAtField id="event-date" value={occurredAt} onChange={setOccurredAt} />
        <SelectField id="event-contact" label="Contacto" value={contactId} onChange={setContactId}>
          <option value="">Sin contacto</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="event-notes">Notas</Label>
        <Textarea id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 className="animate-spin" /> : <Plus />} Registrar evento
      </Button>
    </form>
  );
}
