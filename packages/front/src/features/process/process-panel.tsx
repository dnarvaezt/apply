import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactsPanel } from "@/features/applications/contacts-panel";
import { ReplySyncNotice } from "@/features/applications/reply-sync-notice";
import { useReplySyncStatus } from "@/features/applications/use-reply-sync-status";
import { isGmailEnabled } from "@/features/gmail/gmail-enabled";
import { MoveStatusDialog } from "./move-status-dialog";
import { StatusHistory } from "./status-history";
import { useVacancyProcess } from "./use-vacancy-process";
import { VacancyStatusBadge } from "./vacancy-status-badge";

/** Proceso de la vacante (#80): estado actual, "Mover a…", historial con notas y contactos. */
export function ProcessPanel({ vacancyId }: { vacancyId: string }) {
  const { load, reload, move, ...contacts } = useVacancyProcess(vacancyId);
  const syncStatus = useReplySyncStatus();

  if (load.state === "loading")
    return <LoadingBlock label="Cargando el proceso…" className="h-64" />;
  if (load.state === "error") {
    return (
      <LoadFailure
        title="No se pudo cargar el proceso"
        message={load.message}
        onRetry={() => void reload()}
      />
    );
  }

  const { process, channels } = load.data;
  return (
    <Card data-id="process-panel">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" data-id="process-panel__status">
          <CardTitle>Estado</CardTitle>
          <VacancyStatusBadge status={process.status} discardReason={process.discardReason} />
        </div>
        <MoveStatusDialog current={process.status} channels={channels} onMove={move} />
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4" data-id="process-panel__history">
          {isGmailEnabled() && <ReplySyncNotice status={syncStatus} />}
          <StatusHistory history={process.history} channels={channels} />
        </div>
        <ContactsPanel
          contacts={process.contacts}
          onAdd={contacts.addContact}
          onUpdate={contacts.updateContact}
          onMarkProcessStart={contacts.markProcessStart}
        />
      </CardContent>
    </Card>
  );
}
