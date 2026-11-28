import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bloque gris mientras carga; `label` lo anuncia a los lectores de pantalla. */
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div aria-busy="true" className={cn("h-40 animate-pulse rounded-xl bg-muted", className)}>
      {label && (
        <span className="sr-only" role="status">
          {label}
        </span>
      )}
    </div>
  );
}

/** Error de carga con su motivo y un botón para reintentar. */
export function LoadFailure({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center"
    >
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCw /> Reintentar
      </Button>
    </div>
  );
}
