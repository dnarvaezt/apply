import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PosterFormValues } from "./poster-form";

const FIELDS: {
  key: keyof PosterFormValues;
  label: string;
  type: string;
  placeholder?: string;
}[] = [
  { key: "posterName", label: "Publicada por", type: "text", placeholder: "Nombre" },
  { key: "posterTitle", label: "Cargo de quien publica", type: "text", placeholder: "Recruiter" },
  {
    key: "posterProfileUrl",
    label: "Perfil de quien publica",
    type: "url",
    placeholder: "https://…",
  },
  { key: "postedAt", label: "Fecha de publicación", type: "date" },
];

/** Campos manuales de quién publicó y cuándo; `idPrefix` evita ids repetidos en la página. */
export function PosterFields({
  idPrefix,
  values,
  onChange,
  disabled,
}: {
  idPrefix: string;
  values: PosterFormValues;
  onChange: (values: PosterFormValues) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label, type, placeholder }) => (
        <div key={key} className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-${key}`} className="text-xs">
            {label}
          </Label>
          <Input
            id={`${idPrefix}-${key}`}
            type={type}
            placeholder={placeholder}
            value={values[key]}
            disabled={disabled}
            onChange={(e) => onChange({ ...values, [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
