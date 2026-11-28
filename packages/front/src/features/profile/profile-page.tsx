import type { IndexStatus, ProfileFile } from "@apply/shared";
import { DatabaseZap, FilePlus2, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { SelectRoute } from "@/lib/route-selection";
import { cn } from "@/lib/utils";

export function ProfilePage({
  selectedId: routeId,
  onSelect,
}: {
  /** Archivo de la URL; sin él se muestra el primero. */
  selectedId: string | null;
  onSelect: SelectRoute;
}) {
  const [files, setFiles] = useState<ProfileFile[]>([]);
  const selected = routeId ?? files[0]?.name ?? null;
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const current = files.find((f) => f.name === selected) ?? null;
  const dirty = current !== null && draft !== current.content;

  const refresh = useCallback(async () => {
    const [list, st] = await Promise.all([api.profile.list(), api.index.status()]);
    setFiles(list);
    setStatus(st);
    return list;
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => toast.error(e.message));
  }, [refresh]);

  // El borrador se carga una vez por archivo abierto: recargar la lista no pisa lo que se escribe.
  const draftFor = useRef<string | null>(null);
  useEffect(() => {
    if (selected === draftFor.current) return;
    const file = files.find((f) => f.name === selected);
    if (selected !== null && !file) return;
    draftFor.current = selected;
    setDraft(file?.content ?? "");
  }, [selected, files]);

  function open(file: ProfileFile) {
    if (dirty && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    onSelect(file.name);
  }

  async function save() {
    if (!selected) return;
    try {
      await api.profile.save(selected, draft);
      await refresh();
      toast.success("Guardado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function create(name: string, content: string) {
    const fileName = name.endsWith(".md") ? name : `${name}.md`;
    try {
      const { name: saved } = await api.profile.save(fileName, content);
      await refresh();
      // Reescribir el archivo abierto no cambia la URL: el borrador se actualiza aquí.
      if (saved === selected) setDraft(content);
      else onSelect(saved);
      setNewName("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove() {
    if (!selected || !confirm(`¿Eliminar ${selected}?`)) return;
    await api.profile.remove(selected);
    await refresh();
    onSelect(null);
  }

  async function upload(fileList: FileList | null) {
    for (const file of Array.from(fileList ?? [])) {
      const base = file.name.replace(/\.(md|txt|markdown)$/i, "");
      await create(base, await file.text());
    }
    if (uploadRef.current) uploadRef.current.value = "";
  }

  async function reindex() {
    setIndexing(true);
    try {
      setStatus(await api.index.rebuild());
      toast.success("Índice reconstruido");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIndexing(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="size-4" /> Índice RAG
            </CardTitle>
            <CardDescription>
              {status?.builtAt
                ? `${status.chunks} fragmentos de ${status.files} archivos`
                : "Aún no se ha indexado"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {status?.stale ? (
              <Badge variant="destructive">Desactualizado</Badge>
            ) : (
              <Badge variant="secondary">Al día</Badge>
            )}
            <Button onClick={reindex} disabled={indexing} variant="outline" size="sm">
              <RefreshCw className={cn(indexing && "animate-spin")} />
              {indexing ? "Indexando…" : "Reindexar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              La primera vez se descarga el modelo de embeddings local (~120 MB). Al generar un CV
              se reindexa solo si hay cambios.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Archivos del perfil</CardTitle>
            <CardDescription>
              Los que empiezan con <code>00-</code> siempre se incluyen en el CV.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {files.map((f) => (
              <button
                type="button"
                key={f.name}
                onClick={() => open(f)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  f.name === selected && "bg-muted font-medium",
                )}
              >
                {f.name}
              </button>
            ))}
            <form
              className="mt-2 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) void create(newName.trim(), `# ${newName.trim()}\n\n`);
              }}
            >
              <Input
                placeholder="60-nuevo.md"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button type="submit" size="icon" variant="outline" aria-label="Crear archivo">
                <FilePlus2 />
              </Button>
            </form>
            <input
              ref={uploadRef}
              type="file"
              accept=".md,.txt,.markdown"
              multiple
              hidden
              onChange={(e) => void upload(e.target.files)}
            />
            <Button variant="ghost" size="sm" onClick={() => uploadRef.current?.click()}>
              <Upload /> Importar .md / .txt
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[70vh]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {selected ?? "Sin archivo"}
            {dirty && <Badge variant="outline">sin guardar</Badge>}
          </CardTitle>
          <CardDescription>
            Escribe con detalle: experiencia, logros con métricas, tecnologías, proyectos. Usa
            encabezados <code>##</code> por puesto o proyecto: cada sección es un fragmento del RAG.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <Textarea
            className="min-h-[55vh] flex-1 font-mono text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!selected}
          />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!dirty}>
              <Save /> Guardar
            </Button>
            <Button variant="ghost" onClick={remove} disabled={!selected}>
              <Trash2 /> Eliminar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
