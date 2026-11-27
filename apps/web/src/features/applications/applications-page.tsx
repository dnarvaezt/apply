import type { ApplicationEvent } from "@apply/shared";
import { RotateCw } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationTimeline } from "./application-timeline";
import { ApplicationsList } from "./applications-list";
import { NewApplicationForm } from "./new-application-form";
import { usePipeline } from "./use-pipeline";

/** Pipeline de postulaciones: alta, lista filtrable y línea de tiempo (REQ-001..REQ-005). */
export function ApplicationsPage() {
  const { load, selectedId, events, reload, select, create } = usePipeline();

  if (load.state === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <span className="sr-only" role="status">
          Cargando postulaciones…
        </span>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border p-8 text-center"
      >
        <p className="font-medium">No se pudieron cargar las postulaciones</p>
        <p className="text-sm text-muted-foreground">{load.message}</p>
        <Button variant="outline" onClick={() => void reload()}>
          <RotateCw /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      data-id="applications-page"
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Nueva postulación</CardTitle>
          </CardHeader>
          <CardContent>
            <NewApplicationForm vacancies={load.vacancies} cvs={load.cvs} onCreate={create} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Postulaciones</CardTitle>
          </CardHeader>
          <CardContent>
            {load.rows.length === 0 ? (
              <EmptyState title="Aún no hay postulaciones">
                Registra la primera eligiendo una vacante arriba.
              </EmptyState>
            ) : (
              <ApplicationsList rows={load.rows} selectedId={selectedId} onSelect={select} />
            )}
          </CardContent>
        </Card>
      </div>
      <Card data-id="applications-page__timeline">
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineBody selectedId={selectedId} events={events} />
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineBody({
  selectedId,
  events,
}: {
  selectedId: string | null;
  events: ApplicationEvent[] | null;
}) {
  if (selectedId === null) {
    return (
      <p className="text-sm text-muted-foreground">Elige una postulación para ver sus eventos.</p>
    );
  }
  if (events === null) return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  return <ApplicationTimeline events={events} />;
}
