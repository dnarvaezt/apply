import type { GmailConnectionState, GmailStatus } from "@apply/shared";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

interface StateCopy {
  badge: string;
  variant: BadgeVariant;
  title: string;
  description: (email: string | null) => string;
  /** Texto del botón de conexión; sin botón cuando no aplica. */
  action: string | null;
}

const COPY: Record<GmailConnectionState, StateCopy> = {
  not_configured: {
    badge: "No configurado",
    variant: "outline",
    title: "Gmail no está configurado",
    description: () =>
      "Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env y reinicia la API. Puedes seguir registrando postulaciones a mano.",
    action: null,
  },
  disconnected: {
    badge: "Desconectado",
    variant: "secondary",
    title: "Gmail sin conectar",
    description: () => "Conecta tu cuenta para enviar postulaciones y detectar respuestas.",
    action: "Conectar Gmail",
  },
  connected: {
    badge: "Conectado",
    variant: "default",
    title: "Gmail conectado",
    description: (email) => `Cuenta conectada: ${email ?? "sin dirección"}`,
    action: null,
  },
  reauth_required: {
    badge: "Requiere reconexión",
    variant: "destructive",
    title: "Hay que volver a conectar Gmail",
    description: (email) =>
      `Google rechazó la autorización guardada${email ? ` de ${email}` : ""}. Tus postulaciones siguen intactas.`,
    action: "Volver a conectar",
  },
};

export interface GmailConnectionViewProps {
  status: GmailStatus;
  /** URL de consentimiento abierta mientras se espera el callback. */
  waitingUrl: string | null;
  /** El consentimiento venció sin respuesta. */
  timedOut: boolean;
  onConnect: () => void;
}

/** Estado de la conexión con Gmail y la acción que corresponde (REQ-005, REQ-006, REQ-007). */
export function GmailConnectionView({
  status,
  waitingUrl,
  timedOut,
  onConnect,
}: GmailConnectionViewProps) {
  const copy = COPY[status.state];
  return (
    <section
      className="flex max-w-2xl flex-col gap-4 rounded-xl border p-4 sm:p-6"
      data-id="gmail-connection-view"
      aria-labelledby="gmail-connection-title"
    >
      <div className="flex flex-wrap items-center gap-2" data-id="gmail-connection-view__header">
        <Mail aria-hidden="true" className="size-5 text-muted-foreground" />
        <h2 id="gmail-connection-title" className="font-semibold">
          {copy.title}
        </h2>
        <Badge variant={copy.variant} data-id="gmail-connection-view__state">
          {copy.badge}
        </Badge>
      </div>
      <p
        className="break-words text-sm text-muted-foreground"
        data-id="gmail-connection-view__description"
      >
        {copy.description(status.email)}
      </p>
      {waitingUrl && (
        <p role="status" className="text-sm" data-id="gmail-connection-view__waiting">
          Esperando la autorización en Google…{" "}
          <a
            href={waitingUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Abrir Google otra vez
          </a>
        </p>
      )}
      {timedOut && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-id="gmail-connection-view__timeout"
        >
          No llegó la autorización de Google. Inténtalo de nuevo.
        </p>
      )}
      {copy.action && !waitingUrl && (
        <Button className="self-start" onClick={onConnect}>
          {copy.action}
        </Button>
      )}
    </section>
  );
}
