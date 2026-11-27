import type { RequirementMatch } from "@apply/shared";
import { LEVEL_STYLE } from "@/components/level-style";
import { Badge } from "@/components/ui/badge";

export function MatchList({
  title,
  items,
  matches,
}: {
  title: string;
  items: string[];
  matches?: RequirementMatch[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const m = matches?.find((r) => r.requirement === item);
          return (
            <li key={item} className="flex items-start justify-between gap-2 text-sm">
              <span>{item}</span>
              {m && (
                <Badge
                  className={LEVEL_STYLE[m.level]}
                  title={
                    m.evidence
                      ? `Evidencia: ${m.evidence.file} › ${m.evidence.heading}`
                      : "Sin evidencia clara en tu perfil"
                  }
                >
                  {m.level}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
