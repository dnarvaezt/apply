import type { Vacancy } from "@apply/shared";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Empresa, ubicación, seniority, idioma, plataforma y enlace a la fuente. */
export function VacancyMeta({ vacancy }: { vacancy: Vacancy }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{vacancy.company}</span>
      {vacancy.location && <Badge variant="outline">{vacancy.location}</Badge>}
      {vacancy.seniority && <Badge variant="outline">{vacancy.seniority}</Badge>}
      <Badge variant="secondary">{vacancy.language.toUpperCase()}</Badge>
      <Badge variant="outline">{vacancy.platform}</Badge>
      {vacancy.sourceUrl && (
        <a
          href={vacancy.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          fuente <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
