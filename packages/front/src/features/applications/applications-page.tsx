import type { ApplicationTimeline } from "@apply/shared";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SelectRoute } from "@/lib/route-selection";
import { ApplicationDetail } from "./application-detail";
import { ApplicationsList } from "./applications-list";
import { NewApplicationForm } from "./new-application-form";
import { ReplySyncNotice } from "./reply-sync-notice";
import { usePipeline } from "./use-pipeline";
import { useReplySyncStatus } from "./use-reply-sync-status";

/** Pipeline de postulaciones: alta, lista filtrable, línea de tiempo y registro manual. */
export function ApplicationsPage({
  selectedId,
  onSelect,
}: {
  /** Postulación abierta, la de la URL. */
  selectedId: string | null;
  onSelect: SelectRoute;
}) {
  const { load, timeline, reload, create, ...actions } = usePipeline(selectedId, onSelect);
  const syncStatus = useReplySyncStatus();

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
            <NewApplicationForm
              vacancies={load.vacancies}
              cvs={load.cvs}
              channels={load.channels}
              onCreate={create}
            />
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
              <ApplicationsList rows={load.rows} selectedId={selectedId} onSelect={onSelect} />
            )}
          </CardContent>
        </Card>
      </div>
      <Card data-id="applications-page__timeline">
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReplySyncNotice status={syncStatus} />
          <TimelineBody
            selectedId={selectedId}
            timeline={timeline}
            detail={(view) => (
              <ApplicationDetail
                timeline={view}
                channels={load.channels}
                onAddEvent={actions.addEvent}
                onAddContact={actions.addContact}
                onUpdateContact={actions.updateContact}
                onMarkProcessStart={actions.markProcessStart}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Pide elegir una postulación, muestra la carga o el detalle de la elegida. */
function TimelineBody({
  selectedId,
  timeline,
  detail,
}: {
  selectedId: string | null;
  timeline: ApplicationTimeline | null;
  detail: (timeline: ApplicationTimeline) => ReactNode;
}) {
  if (selectedId === null) {
    return (
      <p className="text-sm text-muted-foreground">Elige una postulación para ver sus eventos.</p>
    );
  }
  if (timeline === null) return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  return detail(timeline);
}
