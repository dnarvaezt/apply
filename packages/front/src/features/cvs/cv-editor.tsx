import type { CvDoc, CvMatchReport, CvMeta } from "@apply/shared";
import { Copy, FileDown, FileText, Loader2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CvPreview } from "@/components/cv-preview";
import { LoadFailure, LoadingBlock } from "@/components/load-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, download } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { CvEmailDraft } from "./cv-email-draft";
import { CvMatchPanel } from "./cv-match-panel";

/** Abre un CV: lo edita en Markdown, lo previsualiza, lo exporta y muestra su cobertura y su correo. */
export function CvEditor({
  cvId,
  onSaved,
  onDeleted,
}: {
  cvId: string;
  onSaved?: (cv: CvMeta) => void;
  onDeleted: () => void;
}) {
  const fetcher = useCallback(() => api.cvs.get(cvId), [cvId]);
  const { load, reload } = useLoad(fetcher);
  if (load.state === "loading") return <LoadingBlock label="Abriendo el CV…" />;
  if (load.state === "error") {
    return (
      <LoadFailure
        title="No se pudo abrir el CV"
        message={load.message}
        onRetry={() => void reload()}
      />
    );
  }
  return <CvDocEditor key={load.data.id} doc={load.data} onSaved={onSaved} onDeleted={onDeleted} />;
}

function CvDocEditor({
  doc,
  onSaved,
  onDeleted,
}: {
  doc: CvDoc;
  onSaved?: (cv: CvMeta) => void;
  onDeleted: () => void;
}) {
  const [cv, setCv] = useState(doc);
  const [markdown, setMarkdown] = useState(doc.markdown);
  const [title, setTitle] = useState(doc.title);
  const [exporting, setExporting] = useState(false);
  const [match, setMatch] = useState<CvMatchReport | null>(null);

  const dirty = markdown !== cv.markdown || title !== cv.title;

  const loadMatch = useCallback((id: string) => {
    setMatch(null);
    api.cvs
      .match(id)
      .then(setMatch)
      .catch((e: Error) => toast.error(`Cobertura: ${e.message}`));
  }, []);

  useEffect(() => loadMatch(doc.id), [doc.id, loadMatch]);

  async function save(): Promise<CvDoc | null> {
    try {
      const updated = await api.cvs.save(cv.id, markdown, title);
      setCv(updated);
      onSaved?.(updated);
      loadMatch(updated.id);
      return updated;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      if (dirty) await save();
      await download(api.cvs.pdfUrl(cv.id), `${cv.id}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${cv.title}"?`)) return;
    try {
      await api.cvs.remove(cv.id);
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void save().then((d) => d && toast.success("Guardado"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-w-0 flex-col gap-3" data-id="cv-editor">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Título del CV"
        />
        {dirty && <Badge variant="outline">sin guardar</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => save().then((d) => d && toast.success("Guardado"))}
            disabled={!dirty}
          >
            <Save /> Guardar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigator.clipboard.writeText(markdown).then(() => toast.success("Markdown copiado"))
            }
          >
            <Copy /> Copiar MD
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => download(new Blob([markdown], { type: "text/markdown" }), `${cv.id}.md`)}
          >
            <FileText /> .md
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Eliminar CV">
            <Trash2 />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="preview">
        <TabsList>
          <TabsTrigger value="edit">Editar</TabsTrigger>
          <TabsTrigger value="preview">Vista previa</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Textarea
            className="min-h-[60vh] resize-y font-mono text-[13px] leading-relaxed"
            aria-label="Markdown del CV"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="max-h-[75vh] min-h-[40vh] overflow-auto rounded-xl border bg-muted/40 p-6">
            <CvPreview markdown={markdown} />
          </div>
        </TabsContent>
      </Tabs>
      {match?.cvId === cv.id && <CvMatchPanel report={match} />}
      <CvEmailDraft cvId={cv.id} />
    </div>
  );
}
