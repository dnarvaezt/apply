import type { EmailDraft, EmailDraftChanges } from "@apply/shared";
import { Loader2, Save } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  draft: EmailDraft;
  saving: boolean;
  onSave: (changes: EmailDraftChanges) => void;
}

/** Campos editables del borrador; se monta con `key` por versión para partir del guardado. */
export function EmailDraftForm({ draft, saving, onSave }: Props) {
  const [to, setTo] = useState(draft.to ?? "");
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const ids = { to: useId(), subject: useId(), body: useId(), missing: useId() };

  const dirty = to !== (draft.to ?? "") || subject !== draft.subject || body !== draft.body;
  const complete = subject.trim() !== "" && body.trim() !== "";
  const missingRecipient = to.trim() === "";

  return (
    <form
      className="flex flex-col gap-3"
      data-id="email-draft-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ to: to.trim(), subject, body });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.to}>Para</Label>
        <Input
          id={ids.to}
          type="email"
          inputMode="email"
          autoComplete="email"
          className="text-base md:text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-describedby={missingRecipient ? ids.missing : undefined}
        />
        {missingRecipient && (
          <p id={ids.missing} className="text-xs text-muted-foreground">
            Falta el destinatario: la vacante no publica un email. Escríbelo antes de enviar.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.subject}>Asunto</Label>
        <Input
          id={ids.subject}
          className="text-base md:text-sm"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.body}>Cuerpo</Label>
        <Textarea
          id={ids.body}
          className="min-h-48 text-base leading-relaxed md:text-sm"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!dirty || !complete || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
        </Button>
        {dirty && <Badge variant="outline">sin guardar</Badge>}
      </div>
    </form>
  );
}
