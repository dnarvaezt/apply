import type { CreateApplicationRequest, CvMeta, Vacancy } from "@apply/shared";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cvsForVacancy } from "./pipeline";
import { SelectField } from "./select-field";

/** Registra una postulación eligiendo la vacante y uno de sus CVs (REQ-004). */
export function NewApplicationForm({
  vacancies,
  cvs,
  onCreate,
}: {
  vacancies: Pick<Vacancy, "id" | "title" | "company">[];
  cvs: Pick<CvMeta, "id" | "title" | "vacancyId">[];
  /** Resuelve `true` si la postulación quedó registrada. */
  onCreate: (req: Pick<CreateApplicationRequest, "vacancyId" | "cvId">) => Promise<boolean>;
}) {
  const [vacancyId, setVacancyId] = useState("");
  const [cvId, setCvId] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const created = await onCreate({ vacancyId, cvId: cvId || null });
    setSaving(false);
    if (created) {
      setVacancyId("");
      setCvId("");
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
      <Button type="submit" disabled={!vacancyId || saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Plus />} Registrar postulación
      </Button>
    </form>
  );
}
