import { Loader2, Mail, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailDraftForm } from "./email-draft-form";
import { EmailSendPanel } from "./email-send-panel";
import { useEmailDraft } from "./use-email-draft";

const REGENERATE_CONFIRM = "Regenerar reemplaza el asunto y el cuerpo actuales. ¿Regenerar?";

/** Correo de postulación del CV abierto: se genera con Claude y se edita (#19), se envía con Gmail (#21). */
export function CvEmailDraft({ cvId }: { cvId: string }) {
  const { load, busy, error, saved, reload, generate, save, send, resolve } = useEmailDraft(cvId);
  /** Versión del borrador con cambios sin guardar: guardar crea otra versión y limpia el aviso. */
  const [dirtyVersion, setDirtyVersion] = useState<string | null>(null);
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
  const version = draft ? `${draft.id}-${draft.updatedAt}` : null;
  const editable = draft?.status === "draft" || draft?.status === "failed";

  return (
    <Card size="sm" data-id="cv-email-draft">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Correo de postulación</CardTitle>
        {draft?.status === "draft" && (
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
        {draft && editable && (
          <EmailDraftForm
            key={version}
            draft={draft}
            saving={busy === "saving"}
            onSave={(changes) => void save(draft.id, changes)}
            onDirtyChange={(dirty) => setDirtyVersion(dirty ? version : null)}
          />
        )}
        {draft && (
          <EmailSendPanel
            draft={draft}
            dirty={dirtyVersion !== null && dirtyVersion === version}
            sending={busy === "sending"}
            onSend={() => void send(draft.id)}
            onResolve={(sent) => void resolve(draft.id, sent)}
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
