import type { MatchReport, Vacancy } from "@apply/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MatchList } from "./match-list";

/** Match del perfil con la vacante: cobertura de obligatorios y evidencia por requisito. */
export function MatchOverview({
  vacancy,
  match,
  matching,
}: {
  vacancy: Pick<Vacancy, "mustHave" | "niceToHave">;
  match: MatchReport | null;
  matching: boolean;
}) {
  const coverage = match ? `${Math.round(match.coverage * 100)}%` : "—";
  return (
    <Card data-id="match-overview">
      <CardHeader>
        <CardTitle>Información de match</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section aria-label="Cobertura" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Cobertura de requisitos obligatorios</span>
            <span className="tabular-nums">{matching ? "calculando…" : coverage}</span>
          </div>
          <Progress value={match ? match.coverage * 100 : 0} />
          <p className="text-xs text-muted-foreground">
            Estimación por similitud semántica con tu perfil. Pasa el cursor sobre cada etiqueta
            para ver la evidencia. Lo “débil” son huecos: agrégalo a tu perfil si de verdad lo
            tienes.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <MatchList title="Obligatorios" items={vacancy.mustHave} matches={match?.requirements} />
          <MatchList title="Deseables" items={vacancy.niceToHave} matches={match?.requirements} />
        </div>
      </CardContent>
    </Card>
  );
}
