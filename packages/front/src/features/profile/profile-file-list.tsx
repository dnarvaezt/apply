import type { ProfileOrder } from "@apply/shared";
import { ArrowDown, ArrowUp, Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { baseName } from "./profile-order.ts";

const MODES: { mode: ProfileOrder["mode"]; label: string }[] = [
  { mode: "custom", label: "Personalizado" },
  { mode: "alpha", label: "A–Z" },
];

export interface ProfileFileListProps {
  names: string[];
  selected: string | null;
  mode: ProfileOrder["mode"];
  onOpen: (name: string) => void;
  onModeChange: (mode: ProfileOrder["mode"]) => void;
  onMove: (name: string, delta: -1 | 1) => void;
  /** Resuelve `true` si el renombre se guardó. */
  onRename: (from: string, to: string) => Promise<boolean>;
}

/** Los archivos del perfil: abrir, ordenar (manual o A–Z) y renombrar sin perder `.md`. */
export function ProfileFileList({
  names,
  selected,
  mode,
  onOpen,
  onModeChange,
  onMove,
  onRename,
}: ProfileFileListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startRename(name: string) {
    setEditing(name);
    setValue(baseName(name));
  }

  async function submitRename(from: string) {
    const to = value.trim();
    if (!to || saving) return;
    setSaving(true);
    const ok = await onRename(from, to);
    setSaving(false);
    if (ok) setEditing(null);
  }

  return (
    <div data-id="profile-file-list" className="flex flex-col gap-1">
      <fieldset data-id="profile-file-list__mode" className="mb-1 flex gap-1">
        <legend className="sr-only">Orden de los archivos</legend>
        {MODES.map((m) => (
          <Button
            key={m.mode}
            type="button"
            size="xs"
            variant={mode === m.mode ? "secondary" : "ghost"}
            aria-pressed={mode === m.mode}
            onClick={() => mode !== m.mode && onModeChange(m.mode)}
          >
            {m.label}
          </Button>
        ))}
      </fieldset>

      <ul data-id="profile-file-list__items" className="flex flex-col gap-0.5">
        {names.map((name, i) =>
          editing === name ? (
            <li key={name}>
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitRename(name);
                }}
              >
                <label className="sr-only" htmlFor="profile-rename">
                  Nuevo nombre de {name}
                </label>
                <Input
                  id="profile-rename"
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                  className="h-8"
                />
                <span className="text-sm text-muted-foreground">.md</span>
                <Button
                  type="submit"
                  size="icon-sm"
                  variant="ghost"
                  disabled={!value.trim() || saving}
                  aria-label="Guardar nombre"
                >
                  <Check />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                  aria-label="Cancelar renombre"
                >
                  <X />
                </Button>
              </form>
            </li>
          ) : (
            <li key={name} className="group flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onOpen(name)}
                aria-current={name === selected ? "true" : undefined}
                className={cn(
                  "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                  name === selected && "bg-muted font-medium",
                )}
                title={name}
              >
                {name}
              </button>
              {mode === "custom" && (
                <>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => onMove(name, -1)}
                    aria-label={`Subir ${name}`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={i === names.length - 1}
                    onClick={() => onMove(name, 1)}
                    aria-label={`Bajar ${name}`}
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => startRename(name)}
                aria-label={`Renombrar ${name}`}
              >
                <Pencil />
              </Button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
