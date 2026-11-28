import type { Channel, TrackingMetrics } from "@apply/shared";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { MetricsView } from "./metrics-view";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; metrics: TrackingMetrics; channels: Channel[] };

/** Pestaña de métricas: se calcula al abrirla, así refleja los últimos eventos. */
export function MetricsPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const [metrics, channels] = await Promise.all([
        api.metrics.tracking(),
        api.applications.channels(),
      ]);
      setLoad({ state: "ready", metrics, channels });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (load.state === "loading") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {["a", "b", "c", "d", "e", "f"].map((k) => (
          <div key={k} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
        <span className="sr-only" role="status">
          Calculando métricas…
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
        <p className="font-medium">No se pudieron calcular las métricas</p>
        <p className="text-sm text-muted-foreground">{load.message}</p>
        <Button variant="outline" onClick={() => void reload()}>
          <RotateCw /> Reintentar
        </Button>
      </div>
    );
  }

  return <MetricsView metrics={load.metrics} channels={load.channels} />;
}
