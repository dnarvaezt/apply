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

/** Href del detalle con su tab; omite el tab por defecto. */
export function detailTabHref(id: string, tab: DetailTab): string {
  return tab === "vacancy" ? detailHref(id) : `${detailHref(id)}?tab=${tab}`;
}

/** `?tab=` elige la sección; cambiarlo reemplaza la entrada del historial. */
export function VacancyDetailRoute() {
  const id = useVacancyId();
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseDetailTab(params.get("tab"));
  const go = (next: DetailTab) => router.replace(detailTabHref(id, next), { scroll: false });
  return (
    <VacancyDetailPage
      id={id}
      tab={tab}
      onSelectTab={go}
      onDeleted={() => router.push("/vacancies")}
    />
  );
}
