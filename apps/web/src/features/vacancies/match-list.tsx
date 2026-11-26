import type { MatchLevel, RequirementMatch } from "@apply/shared";
import { Badge } from "@/components/ui/badge";

const LEVEL_STYLE: Record<MatchLevel, string> = {
  fuerte: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  débil: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

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
