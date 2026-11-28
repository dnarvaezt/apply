import type { Channel, CreateApplicationRequest, CvMeta } from "@apply/shared";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChannelField, OccurredAtField } from "./event-fields";
import { localInputToIso } from "./pipeline";
import { SelectField } from "./select-field";

/** Registra la postulación a la vacante: uno de sus CVs, y el canal y la fecha si fue por otra vía (REQ-004). */
export function NewApplicationForm({
  cvs,
  channels,
  onCreate,
}: {
  /** Los CVs de la vacante: los únicos que tiene sentido adjuntar. */
  cvs: Pick<CvMeta, "id" | "title">[];
  channels: Channel[];
  /** Resuelve `true` si la postulación quedó registrada. */
  onCreate: (
    req: Pick<CreateApplicationRequest, "cvId" | "channel" | "appliedAt">,
  ) => Promise<boolean>;
}) {
  const [cvId, setCvId] = useState(cvs[0]?.id ?? "");
  const [channel, setChannel] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const created = await onCreate({
      cvId: cvId || null,
      channel: channel || null,
      appliedAt: localInputToIso(appliedAt),
    });
    setSaving(false);
    if (created) {
      setChannel("");
      setAppliedAt("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-id="new-application-form">
      <SelectField id="new-application-cv" label="CV" value={cvId} onChange={setCvId}>
        <option value="">Sin CV</option>
        {cvs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </SelectField>
      <ChannelField
        id="new-application-channel"
        channels={channels}
        value={channel}
        onChange={setChannel}
      />
      <OccurredAtField id="new-application-date" value={appliedAt} onChange={setAppliedAt} />
      <Button type="submit" disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Plus />} Registrar postulación
      </Button>
    </form>
  );
}
