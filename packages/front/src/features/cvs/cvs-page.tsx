import type { CvDoc, CvMatchReport, CvMeta } from "@apply/shared";
import { Copy, FileDown, FileText, Loader2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CvPreview } from "@/components/cv-preview";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, download } from "@/lib/api";
import type { SelectRoute } from "@/lib/route-selection";
import { cn } from "@/lib/utils";
import { CvEmailDraft } from "./cv-email-draft";
import { CvMatchPanel } from "./cv-match-panel";

type CvsPageProps = {
  /** CV de la URL; sin él se muestra el primero. */
  selectedId: string | null;
  onSelect: SelectRoute;
};

export function CvsPage({ selectedId: routeId, onSelect }: CvsPageProps) {
  const [list, setList] = useState<CvMeta[]>([]);
  // Sin CV en la URL se muestra el primero, sin navegar.
  const selectedId = routeId ?? list[0]?.id ?? null;
  const [cv, setCv] = useState<CvDoc | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const [exporting, setExporting] = useState(false);
  const [match, setMatch] = useState<CvMatchReport | null>(null);

  const dirty = cv !== null && (markdown !== cv.markdown || title !== cv.title);

  const loadMatch = useCallback((id: string) => {
    setMatch(null);
    api.cvs
      .match(id)
      .then(setMatch)
      .catch((e: Error) => toast.error(`Cobertura: ${e.message}`));
  }, []);

  const open = useCallback(
    async (id: string) => {
      try {
        const doc = await api.cvs.get(id);
        setCv(doc);
        setMarkdown(doc.markdown);
        setTitle(doc.title);
        loadMatch(doc.id);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [loadMatch],
  );

  useEffect(() => {
    api.cvs
      .list()
      .then(setList)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => {
    if (selectedId) void open(selectedId);
    else {
      setCv(null);
      setMatch(null);
    }
  }, [selectedId, open]);

  async function save(): Promise<CvDoc | null> {
    if (!cv) return null;
    try {
      const updated = await api.cvs.save(cv.id, markdown, title);
      setCv(updated);
      setList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      loadMatch(updated.id);
      return updated;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }

  async function exportPdf() {
    if (!cv) return;
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
    if (!cv || !confirm(`¿Eliminar "${cv.title}"?`)) return;
    await api.cvs.remove(cv.id);
    setList((prev) => prev.filter((m) => m.id !== cv.id));
    if (routeId === cv.id) onSelect(null);
  }

  function switchTo(id: string) {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    onSelect(id);
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
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card size="sm" className="h-fit">
        <CardHeader>
          <CardTitle>CVs generados ({list.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground">Genera uno desde la pestaña Vacantes.</p>
          )}
          {list.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => switchTo(m.id)}
              className={cn(
                "flex flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted",
                m.id === cv?.id && "bg-muted",
              )}
            >
              <span className="text-sm font-medium">{m.title}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(m.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {!cv ? (
        <EmptyState title="Ningún CV abierto" />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-md"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Título del CV"
            />
            {dirty && <Badge variant="outline">sin guardar</Badge>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => save().then((d) => d && toast.success("Guardado"))}
                disabled={!dirty}
              >
                <Save /> Guardar
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(markdown)
                    .then(() => toast.success("Markdown copiado"))
                }
              >
                <Copy /> Copiar MD
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download(new Blob([markdown], { type: "text/markdown" }), `${cv.id}.md`)
                }
              >
                <FileText /> .md
              </Button>
              <Button onClick={exportPdf} disabled={exporting}>
                {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
              </Button>
              <Button variant="ghost" size="icon" onClick={remove} aria-label="Eliminar CV">
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
                className="min-h-[75vh] resize-none font-mono text-[13px] leading-relaxed"
                aria-label="Markdown del CV"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[75vh] overflow-auto rounded-xl bg-muted/50 p-4">
                <CvPreview markdown={markdown} />
              </div>
            </TabsContent>
          </Tabs>
          {match?.cvId === cv.id && <CvMatchPanel report={match} />}
          <CvEmailDraft key={cv.id} cvId={cv.id} />
        </div>
      )}
    </div>
  );
}
