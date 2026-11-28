import { Briefcase, FileText, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/features/applications/status-badge";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { matchesSearch, toVacancyRows, type VacancyRow } from "./vacancy-rows";

async function fetchRows() {
  const [vacancies, applications, cvs] = await Promise.all([
    api.vacancies.list(),
    api.applications.list(),
    api.cvs.list(),
  ]);
  return toVacancyRows(vacancies, applications, cvs);
}

const NEW_VACANCY = (
  <Link href="/vacancies/new" className={buttonVariants()}>
    <Plus /> Nueva vacante
  </Link>
);

/** Todas las vacantes ingresadas, con su estado de postulación y sus CVs; buscables por título o empresa. */
export function VacancyListPage() {
  const fetcher = useCallback(fetchRows, []);
  const { load, reload } = useLoad(fetcher);
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-6" data-id="vacancy-list">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Vacantes</h2>
          <p className="text-sm text-muted-foreground">
            {load.state === "ready"
              ? `${load.data.length} ingresadas`
              : "Las vacantes que analizaste, su CV y tu postulación."}
          </p>
        </div>
        {NEW_VACANCY}
      </header>

      {load.state === "loading" && <LoadingBlock label="Cargando vacantes…" />}
      {load.state === "error" && (
        <LoadFailure
          title="No se pudieron cargar las vacantes"
          message={load.message}
          onRetry={() => void reload()}
        />
      )}
      {load.state === "ready" &&
        (load.data.length === 0 ? (
          <EmptyState title="Aún no hay vacantes">
            <p className="mb-3">Pega una vacante, su URL o una captura y Claude la analiza.</p>
            {NEW_VACANCY}
          </EmptyState>
        ) : (
          <VacancyGrid rows={load.data} query={query} onQuery={setQuery} />
        ))}
    </div>
  );
}

function VacancyGrid({
  rows,
  query,
  onQuery,
}: {
  rows: VacancyRow[];
  query: string;
  onQuery: (q: string) => void;
}) {
  const visible = rows.filter((r) => matchesSearch(r, query));
  return (
    <>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar vacantes"
          placeholder="Buscar por título o empresa…"
          className="pl-8"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Ninguna vacante coincide">Prueba con otro título o empresa.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => (
            <VacancyCard key={row.vacancy.id} row={row} />
          ))}
        </ul>
      )}
    </>
  );
}

function VacancyCard({ row: { vacancy, application, cvCount } }: { row: VacancyRow }) {
  return (
    <li>
      <Link
        href={`/vacancies/${encodeURIComponent(vacancy.id)}`}
        className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium leading-snug">{vacancy.title}</p>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Briefcase className="size-3.5 shrink-0" /> {vacancy.company}
            </p>
          </div>
          {application ? (
            <StatusBadge status={application.status} />
          ) : (
            <Badge variant="outline">Sin postular</Badge>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {vacancy.location && <span>{vacancy.location}</span>}
          <span>{vacancy.platform}</span>
          <span className="inline-flex items-center gap-1">
            <FileText className="size-3" />
            {cvCount === 1 ? "1 CV" : `${cvCount} CVs`}
          </span>
          <time dateTime={vacancy.createdAt} className="ml-auto">
            {new Date(vacancy.createdAt).toLocaleDateString()}
          </time>
        </div>
      </Link>
    </li>
  );
}
