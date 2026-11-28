import {
  type Channel,
  DISCARD_REASONS,
  type DiscardReason,
  type MoveStatusRequest,
  VACANCY_STATUSES,
  type VacancyStatus,
} from "@apply/shared";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChannelField, OccurredAtField } from "@/features/applications/event-fields";
import { localInputToIso } from "@/features/applications/pipeline";
import { SelectField } from "@/features/applications/select-field";
import { DISCARD_LABEL, STATUS_LABEL } from "./process-labels";

interface Draft {
  to: VacancyStatus | "";
  reason: DiscardReason | "";
  note: string;
  channel: string;
  occurredAt: string;
}

const EMPTY: Draft = { to: "", reason: "", note: "", channel: "", occurredAt: "" };

/** Lo que el formulario envía: el motivo solo si se descarta; lo vacío no se envía. */
function toMoveRequest(draft: Draft): MoveStatusRequest | null {
  if (draft.to === "") return null;
  if (draft.to === "discarded" && draft.reason === "") return null;
  const note = draft.note.trim();
  return {
    to: draft.to,
    ...(draft.to === "discarded" && { discardReason: draft.reason as DiscardReason }),
    ...(note && { note }),
    ...(draft.channel && { channel: draft.channel }),
    ...(draft.occurredAt && { occurredAt: localInputToIso(draft.occurredAt) }),
  };
}

/** "Mover a…": elige el nuevo estado (cualquiera, como en Jira) con nota, canal y fecha. */
export function MoveStatusDialog({
  current,
  channels,
  onMove,
}: {
  current: VacancyStatus;
  channels: Channel[];
  /** Resuelve `true` si se guardó; entonces el diálogo se cierra. */
  onMove: (req: MoveStatusRequest) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const request = toMoveRequest(draft);
  const discarding = draft.to === "discarded";

  function openChange(next: boolean) {
    setOpen(next);
    if (next) setDraft(EMPTY);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!request || saving) return;
    setSaving(true);
    const saved = await onMove(request);
    setSaving(false);
    if (saved) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger
        render={
          <Button>
            <ArrowRightLeft /> Mover a…
          </Button>
        }
      />
      <DialogContent data-id="move-status-dialog">
        <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Mover la vacante</DialogTitle>
            <DialogDescription>
              Ahora está en «{STATUS_LABEL[current]}». El cambio queda en el historial.
            </DialogDescription>
          </DialogHeader>
          <SelectField
            id="move-to"
            label="Nuevo estado"
            value={draft.to}
            onChange={(to) => set({ to: to as VacancyStatus })}
          >
            <option value="" disabled>
              Elige un estado
            </option>
            {VACANCY_STATUSES.filter((s) => s !== current).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </SelectField>
          {discarding && (
            <SelectField
              id="move-reason"
              label="Motivo del descarte"
              value={draft.reason}
              onChange={(reason) => set({ reason: reason as DiscardReason })}
            >
              <option value="" disabled>
                Elige un motivo
              </option>
              {DISCARD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DISCARD_LABEL[r]}
                </option>
              ))}
            </SelectField>
          )}
          <div className="grid gap-4 sm:grid-cols-2" data-id="move-status-dialog__when">
            <ChannelField
              id="move-channel"
              channels={channels}
              value={draft.channel}
              onChange={(channel) => set({ channel })}
            />
            <OccurredAtField
              id="move-occurred-at"
              value={draft.occurredAt}
              onChange={(occurredAt) => set({ occurredAt })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="move-note">Nota (opcional)</Label>
            <Textarea
              id="move-note"
              className="h-20 text-sm"
              placeholder="Ej.: me escribió la recruiter, piden portafolio…"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!request || saving}>
              {saving && <Loader2 className="animate-spin" />} Mover
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
