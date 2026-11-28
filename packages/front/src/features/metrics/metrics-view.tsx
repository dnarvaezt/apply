import type { Channel, TrackingMetrics } from "@apply/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelLabel } from "../applications/pipeline";

type CountKey = Exclude<keyof TrackingMetrics, "contactOrigin">;

const METRICS: { key: CountKey; label: string; hint: string }[] = [
  { key: "applications", label: "Postulaciones", hint: "Con evento de postulación." },
  {
    key: "companiesContacted",
    label: "Empresas que contactaron",
    hint: "Distintas, con contacto, entrevista u oferta.",
  },
  {
    key: "activeProcesses",
    label: "Procesos activos",
    hint: "Contactadas, en entrevista u oferta.",
  },
  {
    key: "classified",
    label: "Clasificadas",
    hint: "Llegaron a entrevista u oferta, o un contacto inició el proceso.",
  },
  { key: "open", label: "Abiertas", hint: "Sin estado terminal." },
  {
    key: "closed",
    label: "Cerradas",
    hint: "Rechazadas, retiradas, cerradas u ofertas resueltas.",
  },
];

/** Métricas de seguimiento y el origen del primer contacto de cada postulación. */
export function MetricsView({
  metrics,
  channels,
}: {
  metrics: TrackingMetrics;
  channels: Channel[];
}) {
  return (
    <div className="flex flex-col gap-4" data-id="metrics-view">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((m) => (
          <Card key={m.key} data-id="metrics-view__metric">
            <CardHeader>
              <dt>
                <CardDescription>{m.label}</CardDescription>
              </dt>
              <dd>
                <CardTitle className="text-3xl tabular-nums" data-id="metrics-view__value">
                  {metrics[m.key]}
                </CardTitle>
              </dd>
              <dd className="text-xs text-muted-foreground">{m.hint}</dd>
            </CardHeader>
          </Card>
        ))}
      </dl>
      <Card data-id="metrics-view__origin">
        <CardHeader>
          <CardTitle>
            <h2>Origen del contacto</h2>
          </CardTitle>
          <CardDescription>Canal del primer contacto de cada postulación.</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.contactOrigin.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguna postulación tiene contacto todavía.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {metrics.contactOrigin.map((o) => (
                <li key={o.channel ?? ""} className="flex justify-between gap-4 py-2 text-sm">
                  <span>{channelLabel(channels, o.channel)}</span>
                  <span className="font-medium tabular-nums">{o.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
