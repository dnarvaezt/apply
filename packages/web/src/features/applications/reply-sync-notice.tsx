import type { GmailSyncStatus } from "@apply/shared";

const formatter = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

/**
 * Cobertura declarada de la detección de respuestas (#22, C7): qué revisa Gmail y qué se
 * registra a mano, con la última sincronización. `null` si el estado no se pudo leer.
 */
export function ReplySyncNotice({ status }: { status: GmailSyncStatus | null }) {
  return (
    <aside
      className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground"
      data-id="reply-sync-notice"
    >
      <p>
        Las respuestas se detectan solas en el hilo de los correos enviados con Apply y en los
        correos de contactos con email conocido, durante los últimos 90 días
        {status && `, al iniciar y cada ${status.intervalMinutes} minutos`}. Lo que llegue por
        LinkedIn, ATS o teléfono se registra a mano.
      </p>
      {status && (
        <p className="mt-1" data-id="reply-sync-notice__last-sync">
          {status.lastSyncedAt ? (
            <>
              Última sincronización:{" "}
              <time dateTime={status.lastSyncedAt}>
                {formatter.format(new Date(status.lastSyncedAt))}
              </time>
            </>
          ) : (
            "Aún no se ha sincronizado."
          )}
        </p>
      )}
    </aside>
  );
}
