"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { VacancyCreatePage } from "./vacancy-create-page";
import { type DetailTab, parseDetailTab, VacancyDetailPage } from "./vacancy-detail-page";
import { VacancyEditPage } from "./vacancy-edit-page";
import { VacancyListPage } from "./vacancy-list-page";

const detailHref = (id: string) => `/vacancies/${encodeURIComponent(id)}`;

function useVacancyId(): string {
  const { id } = useParams<{ id: string }>();
  return decodeURIComponent(id);
}

export function VacancyListRoute() {
  return <VacancyListPage />;
}

export function VacancyCreateRoute() {
  const router = useRouter();
  return <VacancyCreatePage onCreated={(v) => router.push(detailHref(v.id))} />;
}

export function VacancyEditRoute() {
  const id = useVacancyId();
  const router = useRouter();
  return <VacancyEditPage id={id} onSaved={() => router.push(detailHref(id))} />;
}

/** Href del detalle con su tab y CV; omite los valores por defecto. */
export function detailTabHref(id: string, tab: DetailTab, cvId: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "vacancy") params.set("tab", tab);
  if (cvId) params.set("cv", cvId);
  const query = params.toString();
  return query ? `${detailHref(id)}?${query}` : detailHref(id);
}

/** `?tab=` elige la sección y `?cv=<id>` el CV abierto; cambiarlos reemplaza la entrada del historial. */
export function VacancyDetailRoute() {
  const id = useVacancyId();
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseDetailTab(params.get("tab"));
  const cvId = params.get("cv");
  const go = (nextTab: DetailTab, nextCv: string | null) =>
    router.replace(detailTabHref(id, nextTab, nextCv), { scroll: false });
  return (
    <VacancyDetailPage
      id={id}
      tab={tab}
      onSelectTab={(next) => go(next, cvId)}
      selectedCvId={cvId}
      onSelectCv={(next) => go(tab, next)}
      onDeleted={() => router.push("/vacancies")}
    />
  );
}
