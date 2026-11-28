import type { ContactInput, NewApplicationContactRequest } from "@apply/shared";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TextKey = Exclude<keyof ContactInput, "name">;

const TEXT_FIELDS: { key: TextKey; label: string; type: string; autoComplete: string }[] = [
  { key: "title", label: "Cargo", type: "text", autoComplete: "organization-title" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { key: "profileUrl", label: "LinkedIn", type: "url", autoComplete: "url" },
];

const orEmpty = (v: string | null | undefined) => v ?? "";
const orNull = (v: string) => v.trim() || null;

/**
 * Datos de un contacto (REQ-002). Sin `initial` crea uno y ofrece marcarlo como inicio del
 * proceso; con `initial` lo edita.
 */
export function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ContactInput;
  submitLabel: string;
  /** Resuelve `true` si el contacto quedó guardado. */
  onSubmit: (input: NewApplicationContactRequest) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(orEmpty(initial?.name));
  const [text, setText] = useState<Record<TextKey, string>>({
    title: orEmpty(initial?.title),
    email: orEmpty(initial?.email),
    phone: orEmpty(initial?.phone),
    profileUrl: orEmpty(initial?.profileUrl),
    notes: orEmpty(initial?.notes),
  });
  const [isProcessStart, setIsProcessStart] = useState(false);
  const [saving, setSaving] = useState(false);
  const prefix = initial ? "edit-contact" : "new-contact";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const input: ContactInput = {
      name: name.trim(),
      title: orNull(text.title),
      email: orNull(text.email),
      phone: orNull(text.phone),
      profileUrl: orNull(text.profileUrl),
      notes: orNull(text.notes),
    };
    await onSubmit(initial ? input : { ...input, isProcessStart });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-id="contact-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${prefix}-name`}>Nombre</Label>
          <Input
            id={`${prefix}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <Label htmlFor={`${prefix}-${f.key}`}>{f.label}</Label>
            <Input
              id={`${prefix}-${f.key}`}
              type={f.type}
              autoComplete={f.autoComplete}
              value={text[f.key]}
              onChange={(e) => setText({ ...text, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${prefix}-notes`}>Notas</Label>
        <Textarea
          id={`${prefix}-notes`}
          value={text.notes}
          onChange={(e) => setText({ ...text, notes: e.target.value })}
        />
      </div>
      {!initial && (
        <label className="flex items-center gap-2 text-sm" htmlFor="new-contact-process-start">
          <input
            id="new-contact-process-start"
            type="checkbox"
            className="size-4 accent-primary"
            checked={isProcessStart}
            onChange={(e) => setIsProcessStart(e.target.checked)}
          />
          Inició el proceso
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!name.trim() || saving}>
          {saving && <Loader2 className="animate-spin" />} {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
