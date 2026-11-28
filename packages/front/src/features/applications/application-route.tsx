"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";

/** `/applications/[id]` lleva al detalle de la vacante de esa postulación. */
export function ApplicationRoute() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw);
  const router = useRouter();
  const fetcher = useCallback(() => api.applications.timeline(id), [id]);
  const { load, reload } = useLoad(fetcher);
  const vacancyId = load.state === "ready" ? load.data.application.vacancyId : null;

  useEffect(() => {
    if (vacancyId) router.replace(`/vacancies/${encodeURIComponent(vacancyId)}`);
  }, [vacancyId, router]);

  if (load.state === "error") {
    return (
      <LoadFailure
        title="No se pudo abrir la postulación"
        message={load.message}
        onRetry={() => void reload()}
      />
    );
  }
  return <LoadingBlock label="Abriendo la postulación…" />;
}
