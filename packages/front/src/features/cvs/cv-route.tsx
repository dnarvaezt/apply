"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { detailTabHref } from "@/features/vacancies/vacancy-routes";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { CvEditor } from "./cv-editor";

/** `/cvs/[id]` lleva al tab CV del detalle de su vacante; un CV sin vacante se edita aquí. */
export function CvRoute() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw);
  const router = useRouter();
  const fetcher = useCallback(() => api.cvs.get(id), [id]);
  const { load, reload } = useLoad(fetcher);
  const vacancyId = load.state === "ready" ? load.data.vacancyId : null;

  useEffect(() => {
    if (vacancyId) {
      router.replace(detailTabHref(vacancyId, "cv"));
    }
  }, [vacancyId, router]);

  if (load.state === "error") {
    return (
      <LoadFailure
        title="No se pudo abrir el CV"
        message={load.message}
        onRetry={() => void reload()}
      />
    );
  }
  if (load.state === "loading" || vacancyId) return <LoadingBlock label="Abriendo el CV…" />;
  return <CvEditor cvId={id} onDeleted={() => router.push("/vacancies")} />;
}
