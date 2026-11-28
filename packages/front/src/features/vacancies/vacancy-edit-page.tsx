import type { Vacancy } from "@apply/shared";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { PosterFields } from "./poster-fields";
import { toVacancyChanges, type VacancyFormValues, vacancyFormFrom } from "./vacancy-form";

const TEXT_FIELDS: { key: "title" | "company" | "location" | "seniority"; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "company", label: "Empresa" },
  { key: "location", label: "Ubicación" },
  { key: "seniority", label: "Seniority" },
];

/** Corrige lo que Claude extrajo de la vacante y los datos de su publicación. */
export function VacancyEditPage({ id, onSaved }: { id: string; onSaved: (v: Vacancy) => void }) {
  const fetcher = useCallback(() => api.vacancies.get(id), [id]);
  const { load, reload } = useLoad(fetcher);
  const back = `/vacancies/${encodeURIComponent(id)}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" data-id="vacancy-edit">
      <Link
        href={back}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
      >
        <ArrowLeft /> Volver a la vacante
      </Link>
      {load.state === "loading" && <LoadingBlock label="Cargando la vacante…" className="h-96" />}
      {load.state === "error" && (
        <LoadFailure
          title="No se pudo cargar la vacante"
          message={load.message}
          onRetry={() => void reload()}
        />
      )}
      {load.state === "ready" && (
        <VacancyForm vacancy={load.data} cancelHref={back} onSaved={onSaved} />
      )}
    </div>
  );
}

function VacancyForm({
  vacancy,
  cancelHref,
  onSaved,
}: {
  vacancy: Vacancy;
  cancelHref: string;
  onSaved: (v: Vacancy) => void;
}) {
  const [values, setValues] = useState<VacancyFormValues>(() => vacancyFormFrom(vacancy));
  const [saving, setSaving] = useState(false);
  const missing = !values.title.trim() || !values.company.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await api.vacancies.update(vacancy.id, toVacancyChanges(values));
      toast.success("Vacante guardada");
      onSaved(saved);
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Editar vacante</CardTitle>
          <CardDescription>
            Requisitos y palabras clave quedan como los extrajo Claude.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`vacancy-${key}`}>{label}</Label>
                <Input
                  id={`vacancy-${key}`}
                  value={values[key]}
                  maxLength={200}
                  disabled={saving}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vacancy-summary">Resumen</Label>
            <Textarea
              id="vacancy-summary"
              className="h-28 text-sm"
              maxLength={4000}
              value={values.summary}
              disabled={saving}
              onChange={(e) => setValues({ ...values, summary: e.target.value })}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Publicación</legend>
            <PosterFields
              idPrefix="edit"
              values={values.poster}
              disabled={saving}
              onChange={(poster) => setValues({ ...values, poster })}
            />
          </fieldset>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {missing && (
              <p className="mr-auto text-sm text-destructive">Título y empresa son obligatorios.</p>
            )}
            <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
              Cancelar
            </Link>
            <Button type="submit" disabled={saving || missing}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
