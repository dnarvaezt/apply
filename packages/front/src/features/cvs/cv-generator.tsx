import type { CvDoc, MatchReport } from "@apply/shared";
import { Loader2, Sparkles, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CvPreview } from "@/components/cv-preview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateCv } from "@/lib/api";

/** Genera un CV para la vacante con instrucciones opcionales y muestra el texto mientras llega. */
export function CvGenerator({
  vacancyId,
  onMatch,
  onCreated,
}: {
  vacancyId: string;
  onMatch: (report: MatchReport) => void;
  onCreated: (cv: CvDoc) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [streamed, setStreamed] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function generate() {
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setStreamed("");
    try {
      const cv = await generateCv(
        vacancyId,
        instructions,
        { onStatus: setStatus, onMatch, onDelta: (d) => setStreamed((s) => s + d) },
        controller.signal,
      );
      toast.success("CV generado y guardado");
      setStreamed("");
      onCreated(cv);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setGenerating(false);
      setStatus("");
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-3" data-id="cv-generator">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instructions">Instrucciones extra (opcional)</Label>
        <Textarea
          id="instructions"
          className="h-16 text-sm"
          placeholder="Ej.: máximo 1 página, enfatiza liderazgo, omite el proyecto X…"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={generating}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {generating ? (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            <Square /> Detener
          </Button>
        ) : (
          <Button onClick={generate}>
            <Sparkles /> Generar CV para esta vacante
          </Button>
        )}
        {status && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-3 animate-spin" /> {status}
          </span>
        )}
      </div>
      {streamed && (
        <div className="max-h-[60vh] overflow-auto rounded-xl border bg-muted/40 p-6">
          <CvPreview markdown={streamed} />
        </div>
      )}
    </div>
  );
}
