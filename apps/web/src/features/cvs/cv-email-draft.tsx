import { Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailDraftForm } from "./email-draft-form";
import { useEmailDraft } from "./use-email-draft";

const REGENERATE_CONFIRM = "Regenerar reemplaza el asunto y el cuerpo actuales. ¿Regenerar?";

/** Correo de postulación del CV abierto (#19): se genera con Claude, se edita y se guarda. */
export function CvEmailDraft({ cvId }: { cvId: string }) {
  const { load, busy, error, saved, reload, generate, save } = useEmailDraft(cvId);
  const generating = busy === "generating";

  if (load.state === "loading") {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" data-id="cv-email-draft" />;
  }
  if (load.state === "error") {
    return (
      <Card size="sm" data-id="cv-email-draft">
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">No se pudo cargar el correo: {load.message}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { draft } = load;
  const icon = generating ? <Loader2 className="animate-spin" /> : null;

  return (
    <Card size="sm" data-id="cv-email-draft">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Correo de postulación</CardTitle>
        {draft && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== "idle"}
            onClick={() => confirm(REGENERATE_CONFIRM) && void generate()}
          >
            {icon ?? <RefreshCw />} Regenerar
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!draft && (
          <div
            className="flex flex-wrap items-center gap-2 text-sm"
            data-id="cv-email-draft__empty"
          >
            <p className="text-muted-foreground">Aún no hay correo para este CV.</p>
            <Button size="sm" disabled={generating} onClick={() => void generate()}>
              {icon ?? <Mail />} Generar correo
            </Button>
          </div>
        )}
        {draft && (
          <EmailDraftForm
            key={`${draft.id}-${draft.updatedAt}`}
            draft={draft}
            saving={busy === "saving"}
            onSave={(changes) => void save(draft.id, changes)}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            Borrador guardado
          </p>
        )}
      </CardContent>
    </Card>
  );
}
