import type { ApplicationContact, ContactInput, NewApplicationContactRequest } from "@apply/shared";
import { Flag, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactForm } from "./contact-form";

/** Contactos de la postulación: alta, edición y marca de inicio de proceso (REQ-002, REQ-005). */
export function ContactsPanel({
  contacts,
  onAdd,
  onUpdate,
  onMarkProcessStart,
}: {
  contacts: ApplicationContact[];
  onAdd: (req: NewApplicationContactRequest) => Promise<boolean>;
  onUpdate: (id: string, input: ContactInput) => Promise<boolean>;
  onMarkProcessStart: (id: string, isProcessStart: boolean) => Promise<void>;
}) {
  /** `"new"` mientras se agrega uno; el id del contacto mientras se edita. */
  const [editing, setEditing] = useState<string | null>(null);
  const close = () => setEditing(null);
  const closeIfSaved = (saved: boolean) => {
    if (saved) close();
    return saved;
  };

  return (
    <section
      className="flex flex-col gap-3"
      data-id="contacts-panel"
      aria-labelledby="contacts-title"
    >
      <h3 id="contacts-title" className="font-medium">
        Contactos
      </h3>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin contactos todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-id="contacts-panel__list">
          {contacts.map((c) =>
            editing === c.id ? (
              <li key={c.id}>
                <ContactForm
                  initial={c}
                  submitLabel="Guardar contacto"
                  onSubmit={async (input) => closeIfSaved(await onUpdate(c.id, input))}
                  onCancel={close}
                />
              </li>
            ) : (
              <ContactRow
                key={c.id}
                contact={c}
                onEdit={() => setEditing(c.id)}
                onMarkProcessStart={onMarkProcessStart}
              />
            ),
          )}
        </ul>
      )}
      {editing === "new" ? (
        <ContactForm
          submitLabel="Agregar contacto"
          onSubmit={async (req) => closeIfSaved(await onAdd(req))}
          onCancel={close}
        />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEditing("new")}>
          <UserPlus /> Agregar contacto
        </Button>
      )}
    </section>
  );
}

function ContactRow({
  contact: c,
  onEdit,
  onMarkProcessStart,
}: {
  contact: ApplicationContact;
  onEdit: () => void;
  onMarkProcessStart: (id: string, isProcessStart: boolean) => Promise<void>;
}) {
  const toggle = c.isProcessStart
    ? { label: "Quitar inicio", name: `Quitar inicio de ${c.name}` }
    : { label: "Marcar inicio", name: `Marcar inicio con ${c.name}` };
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
      data-id="contacts-panel__contact"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{c.name}</span>
          {c.isProcessStart && <Badge>Inicio del proceso</Badge>}
        </div>
        {c.title && <span className="text-muted-foreground">{c.title}</span>}
        {c.email && <span className="break-all text-muted-foreground">{c.email}</span>}
        {c.phone && <span className="text-muted-foreground">{c.phone}</span>}
        {c.profileUrl && (
          <a
            href={c.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all underline underline-offset-2"
            aria-label={`Perfil de ${c.name}`}
          >
            {c.profileUrl}
          </a>
        )}
        {c.notes && <p className="text-muted-foreground">{c.notes}</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onMarkProcessStart(c.id, !c.isProcessStart)}
          aria-label={toggle.name}
        >
          <Flag /> {toggle.label}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${c.name}`}>
          <Pencil /> Editar
        </Button>
      </div>
    </li>
  );
}
