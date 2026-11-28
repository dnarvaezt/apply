import type { Vacancy } from "@apply/shared";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describePostedAt } from "./poster-form";

/** La vacante: resumen, quién la publicó, requisitos y palabras clave. */
export function VacancyOverview({ vacancy }: { vacancy: Vacancy }) {
  return (
    <Card data-id="vacancy-overview">
      <CardHeader>
        <CardTitle>La vacante</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed">{vacancy.summary}</p>

        <section
          aria-label="Publicación"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm"
        >
          <span>{describePostedAt(vacancy)}</span>
          {vacancy.posterName && (
            <span className="text-muted-foreground">
              por{" "}
              {vacancy.posterProfileUrl ? (
                <a
                  href={vacancy.posterProfileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-foreground underline"
                >
                  {vacancy.posterName} <ExternalLink className="size-3" />
                </a>
              ) : (
                <span className="text-foreground">{vacancy.posterName}</span>
              )}
              {vacancy.posterTitle && ` · ${vacancy.posterTitle}`}
            </span>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <RequirementList title="Obligatorios" items={vacancy.mustHave} />
          <RequirementList title="Deseables" items={vacancy.niceToHave} />
        </div>

        {vacancy.keywords.length > 0 && (
          <section className="flex flex-wrap gap-1" aria-label="Palabras clave">
            {vacancy.keywords.map((k) => (
              <Badge key={k} variant="outline">
                {k}
              </Badge>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function RequirementList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="list-disc pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
