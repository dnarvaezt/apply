import type { CvMeta, MatchReport } from "@apply/shared";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationPanel } from "@/features/applications/application-panel";
import { CvSection } from "@/features/cvs/cv-section";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { MatchOverview } from "./match-overview";
import { VacancyMeta } from "./vacancy-meta";
import { VacancyOverview } from "./vacancy-overview";

export const DETAIL_TABS = ["vacancy", "cv", "match", "application"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

const TAB_LABEL: Record<DetailTab, string> = {
  vacancy: "Vacante",
  cv: "CV",
  match: "Match",
  application: "Línea de tiempo",
};

/** Tab de la URL (`?tab=`); uno desconocido o ausente abre la vacante. */
export function parseDetailTab(value: string | null): DetailTab {
  return DETAIL_TABS.find((t) => t === value) ?? "vacancy";
}

const newestFirst = (a: CvMeta, b: CvMeta) => b.createdAt.localeCompare(a.createdAt);

async function fetchDetail(id: string) {
  const [vacancy, cvs] = await Promise.all([api.vacancies.get(id), api.cvs.list()]);
  return { vacancy, cvs: cvs.filter((c) => c.vacancyId === id).sort(newestFirst) };
}

/** Detalle de la vacante en tabs: la vacante, su CV, el match y la línea de tiempo. */
export function VacancyDetailPage({
  id,
  tab,
  onSelectTab,
  onDeleted,
}: {
  id: string;
  tab: DetailTab;
  onSelectTab: (tab: DetailTab) => void;
  onDeleted: () => void;
}) {
  const fetcher = useCallback(() => fetchDetail(id), [id]);
  const { load, reload, update } = useLoad(fetcher);
  const [match, setMatch] = useState<MatchReport | null>(null);
  const [matching, setMatching] = useState(true);

  useEffect(() => {
    setMatch(null);
    setMatching(true);
    api.vacancies
      .match(id)
      .then(setMatch)
      .catch((e: Error) => toast.error(`Análisis de match: ${e.message}`))
      .finally(() => setMatching(false));
  }, [id]);

  if (load.state === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <LoadingBlock label="Cargando la vacante…" className="h-24" />
        <LoadingBlock className="h-96" />
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <LoadFailure
          title="No se pudo cargar la vacante"
          message={load.message}
          onRetry={() => void reload()}
        />
      </div>
    );
  }

  const { vacancy, cvs } = load.data;
  // Una vacante tiene un único CV (#76).
  const cv = cvs[0] ?? null;

  async function remove() {
    try {
      await api.vacancies.remove(vacancy.id);
      toast.success("Vacante eliminada");
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const setCvs = (change: (cvs: CvMeta[]) => CvMeta[]) =>
    update((d) => ({ ...d, cvs: change(d.cvs) }));

  return (
    <div className="flex flex-col gap-6" data-id="vacancy-detail">
      <header className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{vacancy.title}</h2>
            <VacancyMeta vacancy={vacancy} />
          </div>
          <div className="flex gap-2">
            <Link
              href={`/vacancies/${encodeURIComponent(vacancy.id)}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil /> Editar
            </Link>
            <ConfirmDialog
              trigger={
                <Button variant="ghost">
                  <Trash2 /> Eliminar
                </Button>
              }
              title={`¿Eliminar la vacante "${vacancy.title}"?`}
              description="Se borran la vacante y su análisis de match; su CV se conserva sin vacante. No se puede deshacer."
              confirmLabel="Eliminar vacante"
              onConfirm={() => void remove()}
            />
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(next) => onSelectTab(parseDetailTab(String(next)))}>
        <TabsList aria-label="Secciones de la vacante">
          {DETAIL_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="px-3">
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="vacancy">
          <VacancyOverview vacancy={vacancy} />
        </TabsContent>
        <TabsContent value="cv">
          <CvSection
            vacancyId={vacancy.id}
            cv={cv}
            onMatch={setMatch}
            onGenerated={(doc) => setCvs(() => [doc])}
            onSaved={(saved) => setCvs(() => [saved])}
            onDeleted={() => setCvs(() => [])}
          />
        </TabsContent>
        <TabsContent value="match">
          <MatchOverview vacancy={vacancy} match={match} matching={matching} />
        </TabsContent>
        <TabsContent value="application">
          <ApplicationPanel vacancyId={vacancy.id} cvs={cvs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/vacancies"
      className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
    >
      <ArrowLeft /> Vacantes
    </Link>
  );
}
