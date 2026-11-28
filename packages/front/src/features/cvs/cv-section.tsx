import type { CvDoc, CvMeta, MatchReport } from "@apply/shared";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CvEditor } from "./cv-editor";
import { CvEmailMessage } from "./cv-email-message";
import { CvGenerator } from "./cv-generator";

/** El único CV de la vacante (#76): generarlo, regenerarlo con IA, editarlo y redactar su correo. */
export function CvSection({
  vacancyId,
  cv,
  onMatch,
  onGenerated,
  onSaved,
  onDeleted,
}: {
  vacancyId: string;
  cv: CvMeta | null;
  onMatch: (report: MatchReport) => void;
  onGenerated: (cv: CvDoc) => void;
  onSaved: (cv: CvMeta) => void;
  onDeleted: (id: string) => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  // Regenerar elimina el CV actual y crea otro: mientras se genera, el actual ya no se muestra.
  const [generating, setGenerating] = useState(false);

  function generated(doc: CvDoc) {
    setRegenerating(false);
    onGenerated(doc);
  }

  return (
    <Card data-id="cv-section">
      <CardHeader>
        <CardTitle>CV para esta vacante</CardTitle>
        {cv && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setRegenerating((v) => !v)}>
              {regenerating ? <X /> : <Sparkles />} {regenerating ? "Cerrar" : "Regenerar con IA"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!cv && (
          <EmptyState title="Aún no hay un CV para esta vacante">
            Genéralo con tu perfil; Claude lo alinea a los requisitos.
          </EmptyState>
        )}
        {(!cv || regenerating) && (
          <CvGenerator
            vacancyId={vacancyId}
            replacing={cv !== null}
            onMatch={onMatch}
            onCreated={generated}
            onGeneratingChange={setGenerating}
          />
        )}
        {cv && !generating && (
          <>
            <CvEditor
              key={cv.id}
              cvId={cv.id}
              onSaved={onSaved}
              onDeleted={() => onDeleted(cv.id)}
            />
            <CvEmailMessage key={`email-${cv.id}`} cvId={cv.id} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
