import type { CvMeta } from "@apply/shared";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isGmailEnabled } from "@/features/gmail/gmail-enabled";
import { ApplicationDetail } from "./application-detail";
import { NewApplicationForm } from "./new-application-form";
import { ReplySyncNotice } from "./reply-sync-notice";
import { useReplySyncStatus } from "./use-reply-sync-status";
import { useVacancyApplication } from "./use-vacancy-application";

/** Postulación de la vacante: registrarla o seguir su estado, línea de tiempo y contactos. */
export function ApplicationPanel({
  vacancyId,
  cvs,
}: {
  vacancyId: string;
  /** CVs de la vacante, del más reciente al más antiguo. */
  cvs: Pick<CvMeta, "id" | "title">[];
}) {
  const { load, reload, create, ...actions } = useVacancyApplication(vacancyId);
  const syncStatus = useReplySyncStatus();

  return (
    <Card data-id="application-panel">
      <CardHeader>
        <CardTitle>Línea de tiempo de la postulación</CardTitle>
        {load.state === "ready" && load.data.timeline === null && (
          <CardDescription>Aún no te postulaste a esta vacante.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {load.state === "loading" && <LoadingBlock label="Cargando la postulación…" />}
        {load.state === "error" && (
          <LoadFailure
            title="No se pudo cargar la postulación"
            message={load.message}
            onRetry={() => void reload()}
          />
        )}
        {load.state === "ready" &&
          (load.data.timeline === null ? (
            <NewApplicationForm
              key={cvs[0]?.id ?? "none"}
              cvs={cvs}
              channels={load.data.channels}
              onCreate={create}
            />
          ) : (
            <>
              {isGmailEnabled() && <ReplySyncNotice status={syncStatus} />}
              <ApplicationDetail
                timeline={load.data.timeline}
                channels={load.data.channels}
                onAddEvent={actions.addEvent}
                onAddContact={actions.addContact}
                onUpdateContact={actions.updateContact}
                onMarkProcessStart={actions.markProcessStart}
              />
            </>
          ))}
      </CardContent>
    </Card>
  );
}
