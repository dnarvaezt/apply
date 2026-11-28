import type { CvMatchReport, CvRequirementMatch } from "@apply/shared";
import { LEVEL_STYLE } from "@/components/level-style";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const percent = (value: number) => `${Math.round(value * 100)} %`;

function RequirementRow({ match }: { match: CvRequirementMatch }) {
  return (
    <li className="flex flex-col gap-1 text-sm" data-id="cv-match-requirement">
      <div className="flex items-start justify-between gap-2">
        <span>{match.requirement}</span>
        <Badge className={LEVEL_STYLE[match.level]}>{match.level}</Badge>
      </div>
      {match.evidence ? (
        <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
          <span className="font-medium">{match.evidence.heading}</span>
          <span className="block">{match.evidence.text}</span>
        </blockquote>
      ) : (
        <span className="text-xs text-muted-foreground">Sin evidencia en el CV</span>
      )}
    </li>
  );
}

function RequirementGroup({ title, items }: { title: string; items: CvRequirementMatch[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex flex-col gap-2">
        {items.map((m) => (
          <RequirementRow key={`${m.kind}-${m.requirement}`} match={m} />
        ))}
      </ul>
    </div>
  );
}

/** Cobertura del CV generado frente a su vacante (#16): requisitos, evidencia y palabras clave. */
export function CvMatchPanel({ report }: { report: CvMatchReport }) {
  return (
    <Card size="sm" data-id="cv-match-panel">
      <CardHeader>
        <CardTitle>Cobertura frente a la vacante</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Requisitos obligatorios</dt>
            <dd className="text-lg font-semibold" data-id="cv-match-coverage">
              {percent(report.coverage)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Palabras clave</dt>
            <dd className="text-lg font-semibold" data-id="cv-match-keyword-coverage">
              {percent(report.keywords.coverage)}
            </dd>
          </div>
        </dl>
        {report.keywords.missing.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-sm font-medium">Palabras clave ausentes</h4>
            <div className="flex flex-wrap gap-1">
              {report.keywords.missing.map((k) => (
                <Badge key={k} variant="outline">
                  {k}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <RequirementGroup
          title="Obligatorios"
          items={report.requirements.filter((r) => r.kind === "must")}
        />
        <RequirementGroup
          title="Deseables"
          items={report.requirements.filter((r) => r.kind === "nice")}
        />
      </CardContent>
    </Card>
  );
}
