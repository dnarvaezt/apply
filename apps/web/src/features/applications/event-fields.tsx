import type { Channel } from "@apply/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toLocalInput } from "./pipeline";
import { SelectField } from "./select-field";

/** Canal de la tabla `channels`; vacío es "sin canal". */
export function ChannelField({
  id,
  channels,
  value,
  onChange,
}: {
  id: string;
  channels: Channel[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <SelectField id={id} label="Canal" value={value} onChange={onChange}>
      <option value="">Sin canal</option>
      {channels.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.name}
        </option>
      ))}
    </SelectField>
  );
}

/** Fecha y hora en que ocurrió; no admite el futuro y vacía significa "ahora". */
export function OccurredAtField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>Fecha</Label>
      <Input
        id={id}
        type="datetime-local"
        value={value}
        max={toLocalInput(new Date())}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Vacía para usar el momento actual.
      </p>
    </div>
  );
}
