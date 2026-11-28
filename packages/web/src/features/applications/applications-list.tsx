import { APPLICATION_STATUSES, type ApplicationStatus } from "@apply/shared";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  matchesFilter,
  type PipelineFilter,
  type PipelineRow,
  STATUS_LABEL,
  type StateFilter,
} from "./pipeline";
import { SelectField } from "./select-field";

/** Lista de postulaciones filtrable por estado y por activa o cerrada (REQ-001, REQ-002). */
export function ApplicationsList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PipelineRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<PipelineFilter>({ status: "all", state: "all" });
  const visible = rows.filter((r) => matchesFilter(r.application, filter));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          id="applications-status"
          label="Estado"
          value={filter.status}
          onChange={(v) => setFilter((f) => ({ ...f, status: v as ApplicationStatus | "all" }))}
        >
          <option value="all">Todos</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="applications-state"
          label="Activa o cerrada"
          value={filter.state}
          onChange={(v) => setFilter((f) => ({ ...f, state: v as StateFilter }))}
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="closed">Cerradas</option>
        </SelectField>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna postulación coincide con el filtro.</p>
      ) : (
        <ul className="flex flex-col gap-1" data-id="applications-list">
          {visible.map(({ application: a, vacancy, company }) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                aria-current={a.id === selectedId ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted",
                  a.id === selectedId && "bg-muted",
                )}
              >
                <span className="text-sm font-medium">{vacancy}</span>
                <span className="text-xs text-muted-foreground">{company}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{STATUS_LABEL[a.status]}</Badge>
                  <Badge variant="outline">{a.active ? "Activa" : "Cerrada"}</Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
