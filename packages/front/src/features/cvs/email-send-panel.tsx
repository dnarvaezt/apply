import type { EmailDraft } from "@apply/shared";
import { CheckCircle2, Eye, Loader2, RefreshCw, Send } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

interface Props {
  draft: EmailDraft;
  /** El formulario tiene cambios sin guardar: se envía lo guardado, así que se bloquea. */
  dirty: boolean;
  sending: boolean;
  onSend: () => void;
  onResolve: (sent: boolean) => void;
}

/** Envío del correo con Gmail (#21): vista previa, confirmación explícita y estado del envío. */
export function EmailSendPanel({ draft, dirty, sending, onSend, onResolve }: Props) {
  if (draft.status === "sent") return <SentNotice sentAt={draft.sentAt} />;
  if (draft.status === "sending") {
    return <UnconfirmedSend sending={sending} onCheck={onSend} onResolve={onResolve} />;
  }
  return (
    <div className="flex flex-col gap-3" data-id="email-send-panel">
      {draft.status === "failed" && (
        <p className="text-sm text-destructive" data-id="email-send-panel__failed">
          El último envío falló. Corrige el correo si hace falta y vuelve a enviarlo.
        </p>
      )}
      {draft.to ? (
        <SendPreview draft={draft} dirty={dirty} sending={sending} onSend={onSend} />
      ) : (
        <p className="text-sm text-muted-foreground" data-id="email-send-panel__no-recipient">
          Sin destinatario no se envía con Gmail: escribe uno y guarda, o registra la postulación a
          mano.
        </p>
      )}
    </div>
  );
}

function SentNotice({ sentAt }: { sentAt: string | null }) {
  const when = sentAt ? new Date(sentAt).toLocaleString("es") : "fecha desconocida";
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
      data-id="email-send-panel"
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
      Enviado el {when}. La postulación quedó registrada.
    </p>
  );
}

function UnconfirmedSend({
  sending,
  onCheck,
  onResolve,
}: {
  sending: boolean;
  onCheck: () => void;
  onResolve: (sent: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm" data-id="email-send-panel">
      <p data-id="email-send-panel__unconfirmed">
        No se pudo confirmar si Gmail envió el correo. Revisa la carpeta Enviados de Gmail.
      </p>
      <div className="flex flex-wrap gap-2" data-id="email-send-panel__resolve">
        <Button variant="outline" size="sm" disabled={sending} onClick={onCheck}>
          {sending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Verificar de nuevo
        </Button>
        <Button variant="outline" size="sm" disabled={sending} onClick={() => onResolve(true)}>
          Sí se envió
        </Button>
        <Button variant="outline" size="sm" disabled={sending} onClick={() => onResolve(false)}>
          No se envió
        </Button>
      </div>
    </div>
  );
}

function SendPreview({
  draft,
  dirty,
  sending,
  onSend,
}: {
  draft: EmailDraft;
  dirty: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const ids = { preview: useId(), reviewed: useId() };

  return (
    <>
      <Button
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls={ids.preview}
        onClick={() => setOpen(!open)}
      >
        <Eye /> Vista previa del envío
      </Button>
      {open && (
        <section
          id={ids.preview}
          aria-label="Vista previa del envío"
          className="flex flex-col gap-3 rounded-lg border p-3"
          data-id="email-send-panel__preview"
        >
          <dl className="grid gap-1 text-sm" data-id="email-send-panel__fields">
            <dt className="text-muted-foreground">Para</dt>
            <dd className="break-all">{draft.to}</dd>
            <dt className="text-muted-foreground">Asunto</dt>
            <dd className="break-words">{draft.subject}</dd>
            <dt className="text-muted-foreground">Cuerpo</dt>
            <dd className="whitespace-pre-wrap break-words">{draft.body}</dd>
          </dl>
          <iframe
            title="PDF adjunto"
            src={`${api.cvs.pdfUrl(draft.cvId)}?inline=1`}
            className="h-96 w-full rounded-md border bg-background"
            data-id="email-send-panel__pdf"
          />
          <div className="flex items-center gap-2 text-sm" data-id="email-send-panel__confirm">
            <input
              id={ids.reviewed}
              type="checkbox"
              className="size-5 accent-primary"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <label htmlFor={ids.reviewed}>Revisé asunto, cuerpo y PDF</label>
          </div>
          {dirty && (
            <p className="text-sm text-muted-foreground">Guarda los cambios antes de enviar.</p>
          )}
          <Button className="self-start" disabled={!reviewed || dirty || sending} onClick={onSend}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />} Enviar con Gmail
          </Button>
        </section>
      )}
    </>
  );
}
