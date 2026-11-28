import type { EmailDraft } from "@apply/shared";
import { Copy, Loader2, Mail } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { LoadFailure } from "@/components/load-state";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";

/** Mensaje de correo para enviar el CV (#76): la IA redacta asunto y cuerpo, listos para copiar. */
export function CvEmailMessage({ cvId }: { cvId: string }) {
  const fetcher = useCallback(() => api.emailDrafts.forCv(cvId), [cvId]);
  const { load, reload, update } = useLoad(fetcher);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const draft = await api.emailDrafts.generate(cvId);
      update(() => draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  if (load.state === "error") {
    return (
      <LoadFailure
        title="No se pudo cargar el mensaje de correo"
        message={load.message}
        onRetry={() => void reload()}
      />
    );
  }
  const message = load.state === "ready" ? load.data : null;

  return (
    <section
      aria-labelledby="cv-email-message-title"
      className="flex flex-col gap-3 rounded-xl border p-4"
      data-id="cv-email-message"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="cv-email-message-title" className="text-sm font-medium">
          Mensaje de correo
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={generate}
          disabled={generating || load.state === "loading"}
        >
          {generating ? <Loader2 className="animate-spin" /> : <Mail />}
          {message ? "Regenerar mensaje" : "Generar mensaje de correo"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && <MessageText message={message} />}
    </section>
  );
}

function MessageText({ message }: { message: EmailDraft }) {
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(`${what} copiado`));

  return (
    <div className="flex flex-col gap-3" data-id="cv-email-message__text">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-muted-foreground">Asunto: </span>
          <span className="font-medium">{message.subject}</span>
        </p>
        <Button variant="ghost" size="sm" onClick={() => copy(message.subject, "Asunto")}>
          <Copy /> Copiar asunto
        </Button>
      </div>
      <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{message.body}</p>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => copy(message.body, "Mensaje")}
      >
        <Copy /> Copiar mensaje
      </Button>
    </div>
  );
}
