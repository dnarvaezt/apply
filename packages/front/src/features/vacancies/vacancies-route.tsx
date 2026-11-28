"use client";

import { useRouter } from "next/navigation";
import { useRouteSelection } from "@/lib/route-selection";
import { VacanciesPage } from "./vacancies-page";

/** Conecta la vista con la URL: `/vacancies` es la lista y `/vacancies/[id]` el elemento abierto. */
export function VacanciesRoute() {
  const { selectedId, onSelect } = useRouteSelection("/vacancies", "id");
  const router = useRouter();
  return (
    <VacanciesPage
      selectedId={selectedId}
      onSelect={onSelect}
      onCvCreated={(cv) => router.push(`/cvs/${encodeURIComponent(cv.id)}`)}
    />
  );
}
