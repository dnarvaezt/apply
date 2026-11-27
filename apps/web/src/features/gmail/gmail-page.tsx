import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GmailConnectionView } from "./gmail-connection-view";
import { useGmailConnection } from "./use-gmail-connection";

/** Pestaña de Gmail: conexión de la cuenta que envía y detecta respuestas. */
export function GmailPage() {
  const { load, waitingUrl, timedOut, reload, connect } = useGmailConnection();

  if (load.state === "loading") {
    return (
      <div
        className="flex max-w-2xl flex-col gap-3 rounded-xl border p-6"
        aria-busy="true"
        data-id="gmail-page"
      >
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <span className="sr-only" role="status">
          Consultando Gmail…
        </span>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div
        role="alert"
        className="flex max-w-2xl flex-col items-center gap-3 rounded-lg border p-8 text-center"
        data-id="gmail-page"
      >
        <p className="font-medium">No se pudo consultar el estado de Gmail</p>
        <p className="break-words text-sm text-muted-foreground">{load.message}</p>
        <Button variant="outline" onClick={() => void reload()}>
          <RotateCw /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div data-id="gmail-page">
      <GmailConnectionView
        status={load.status}
        waitingUrl={waitingUrl}
        timedOut={timedOut}
        onConnect={() => void connect()}
      />
    </div>
  );
}
