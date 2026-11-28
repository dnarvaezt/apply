import type { CvDoc, CvMeta, MatchReport } from "@apply/shared";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CvEditor } from "./cv-editor";
import { CvGenerator } from "./cv-generator";

/** Los CVs de la vacante: elegir uno, editarlo, o generar uno nuevo. */
export function CvSection({
  vacancyId,
  cvs,
  selectedCvId,
  onSelectCv,
  onMatch,
  onCreated,
  onSaved,
  onDeleted,
}: {
  vacancyId: string;
  /** CVs de la vacante, del más reciente al más antiguo. */
  cvs: CvMeta[];
  selectedCvId: string | null;
  onSelectCv: (id: string) => void;
  onMatch: (report: MatchReport) => void;
  onCreated: (cv: CvDoc) => void;
  onSaved: (cv: CvMeta) => void;
  onDeleted: (id: string) => void;
}) {
  const [showGenerator, setShowGenerator] = useState(false);
  const generatorOpen = showGenerator || cvs.length === 0;

  return (
    <Card data-id="cv-section">
      <CardHeader>
        <CardTitle>CV para esta vacante</CardTitle>
        {cvs.length > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setShowGenerator((v) => !v)}>
              {showGenerator ? <X /> : <Plus />} {showGenerator ? "Cerrar" : "Nuevo CV"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cvs.length === 0 && (
          <EmptyState title="Aún no hay un CV para esta vacante">
            Genéralo con tu perfil; Claude lo alinea a los requisitos.
          </EmptyState>
        )}
        {generatorOpen && (
          <CvGenerator
            vacancyId={vacancyId}
            onMatch={onMatch}
            onCreated={(cv) => {
              setShowGenerator(false);
              onCreated(cv);
            }}
          />
        )}
        {cvs.length > 1 && (
          <nav aria-label="Versiones del CV" className="flex flex-wrap gap-1">
            {cvs.map((cv) => (
              <button
                key={cv.id}
                type="button"
                aria-current={cv.id === selectedCvId ? "true" : undefined}
                onClick={() => onSelectCv(cv.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-left text-xs hover:bg-muted",
                  cv.id === selectedCvId && "border-primary bg-muted font-medium",
                )}
              >
                {cv.title}
                <span className="block text-[11px] text-muted-foreground">
                  {new Date(cv.updatedAt).toLocaleString()}
                </span>
              </button>
            ))}
          </nav>
        )}
        {selectedCvId && (
          <CvEditor
            key={selectedCvId}
            cvId={selectedCvId}
            onSaved={onSaved}
            onDeleted={() => onDeleted(selectedCvId)}
          />
        )}
      </CardContent>
    </Card>
  );
}
