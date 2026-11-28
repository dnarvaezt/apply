import type { Channel, CreateApplicationRequest, CvMeta, Vacancy } from "@apply/shared";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChannelField, OccurredAtField } from "./event-fields";
import { cvsForVacancy, localInputToIso } from "./pipeline";
import { SelectField } from "./select-field";

/** Registra una postulación: vacante, uno de sus CVs, y el canal y la fecha si fue por otra vía (REQ-004). */
export function NewApplicationForm({
  vacancies,
  cvs,
  channels,
  onCreate,
}: {
  vacancies: Pick<Vacancy, "id" | "title" | "company">[];
  cvs: Pick<CvMeta, "id" | "title" | "vacancyId">[];
  channels: Channel[];
  /** Resuelve `true` si la postulación quedó registrada. */
  onCreate: (
    req: Pick<CreateApplicationRequest, "vacancyId" | "cvId" | "channel" | "appliedAt">,
  ) => Promise<boolean>;
}) {
  const [vacancyId, setVacancyId] = useState("");
  const [cvId, setCvId] = useState("");
  const [channel, setChannel] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const created = await onCreate({
      vacancyId,
      cvId: cvId || null,
      channel: channel || null,
      appliedAt: localInputToIso(appliedAt),
    });
    setSaving(false);
    if (created) {
      setVacancyId("");
      setCvId("");
      setChannel("");
      setAppliedAt("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-id="new-application-form">
      <SelectField
        id="new-application-vacancy"
        label="Vacante"
        value={vacancyId}
        onChange={(v) => {
          setVacancyId(v);
          setCvId("");
        }}
      >
        <option value="">Elige una vacante</option>
        {vacancies.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title} · {v.company}
          </option>
        ))}
      </SelectField>
      <SelectField id="new-application-cv" label="CV" value={cvId} onChange={setCvId}>
        <option value="">Sin CV</option>
        {cvsForVacancy(cvs, vacancyId).map((c) => (
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
      <Button type="submit" disabled={!vacancyId || saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Plus />} Registrar postulación
      </Button>
    </form>
  );
}
