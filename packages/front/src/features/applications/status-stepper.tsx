import type { ApplicationEvent, ApplicationStatus } from "@apply/shared";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusSteps } from "./pipeline";
import { StatusBadge } from "./status-badge";

/** Hitos del proceso (postulada → oferta) y, al lado, el estado actual. */
export function StatusStepper({
  status,
  events,
}: {
  status: ApplicationStatus;
  events: Pick<ApplicationEvent, "type">[];
}) {
  return (
    <div className="flex flex-col gap-3" data-id="status-stepper">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Estado actual</span>
        <StatusBadge status={status} />
      </div>
      <ol aria-label="Hitos del proceso" className="grid grid-cols-5 gap-1">
        {statusSteps(events).map((step) => (
          <li
            key={step.type}
            aria-current={step.type === status ? "step" : undefined}
            className="flex flex-col items-center gap-1 text-center"
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs",
                step.reached
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-dashed text-muted-foreground",
              )}
            >
              {step.reached ? <Check className="size-4" aria-hidden /> : null}
            </span>
            <span className={cn("text-xs", step.reached ? "font-medium" : "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">{step.reached ? " (alcanzado)" : " (pendiente)"}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
