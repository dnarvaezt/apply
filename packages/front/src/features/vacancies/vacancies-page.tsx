import type { CvDoc, MatchReport, Vacancy } from "@apply/shared";
import { ExternalLink, Loader2, Plus, Save, Sparkles, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CvPreview } from "@/components/cv-preview";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, generateCv } from "@/lib/api";
import type { SelectRoute } from "@/lib/route-selection";
import { cn } from "@/lib/utils";
import { readImageFile } from "./image-file";
import { MatchList } from "./match-list";
import { PosterFields } from "./poster-fields";
import {
  describePostedAt,
  EMPTY_POSTER_FORM,
  type PosterFormValues,
  posterFormFrom,
  toCreateFields,
  toManualFields,
} from "./poster-form";

type SourceMode = "text" | "url" | "image" | "browser";

type VacanciesPageProps = {
  /** Vacante de la URL; sin ella se muestra la primera. */
  selectedId: string | null;
  onSelect: SelectRoute;
  onCvCreated: (cv: CvDoc) => void;
};

export function VacanciesPage({ selectedId: routeId, onSelect, onCvCreated }: VacanciesPageProps) {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  // Sin vacante en la URL se muestra la primera, sin navegar.
  const selectedId = routeId ?? vacancies[0]?.id ?? null;
  const [mode, setMode] = useState<SourceMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [newPoster, setNewPoster] = useState<PosterFormValues>(EMPTY_POSTER_FORM);
  const [editPoster, setEditPoster] = useState<PosterFormValues>(EMPTY_POSTER_FORM);
  const [savingPoster, setSavingPoster] = useState(false);

  const [match, setMatch] = useState<MatchReport | null>(null);
  const [matching, setMatching] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [streamed, setStreamed] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const selected = vacancies.find((v) => v.id === selectedId) ?? null;

  useEffect(() => {
    setEditPoster(selected ? posterFormFrom(selected) : EMPTY_POSTER_FORM);
  }, [selected]);

  useEffect(() => {
    api.vacancies
      .list()
      .then(setVacancies)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => {
    setMatch(null);
    setStreamed("");
    if (!selectedId) return;
    setMatching(true);
    api.vacancies
      .match(selectedId)
      .then(setMatch)
      .catch((e: Error) => toast.error(`Análisis de match: ${e.message}`))
      .finally(() => setMatching(false));
  }, [selectedId]);

  async function add() {
    setAdding(true);
    try {
      const source =
        mode === "text"
          ? { text }
          : mode === "url"
            ? { url }
            : mode === "browser"
              ? { url, browser: true }
              : { image: await readImageFile(imageFile as File) };
      const v = await api.vacancies.create({ ...source, ...toCreateFields(newPoster) });
      setVacancies((prev) => [v, ...prev]);
      onSelect(v.id);
      setText("");
      setUrl("");
      setImageFile(null);
      setNewPoster(EMPTY_POSTER_FORM);
      toast.success(`Vacante analizada: ${v.title}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function savePoster() {
    if (!selected) return;
    setSavingPoster(true);
    try {
      const v = await api.vacancies.update(selected.id, toManualFields(editPoster));
      setVacancies((prev) => prev.map((p) => (p.id === v.id ? v : p)));
      toast.success("Datos de publicación guardados");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPoster(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta vacante?")) return;
    await api.vacancies.remove(id);
    setVacancies((prev) => prev.filter((v) => v.id !== id));
    if (routeId === id) onSelect(null);
  }

  async function generate() {
    if (!selected) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setStreamed("");
    try {
      const cv = await generateCv(
        selected.id,
        instructions,
        {
          onStatus: setGenStatus,
          onMatch: setMatch,
          onDelta: (d) => setStreamed((s) => s + d),
        },
        controller.signal,
      );
      toast.success("CV generado y guardado");
      onCvCreated(cv);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setGenerating(false);
      setGenStatus("");
      abortRef.current = null;
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Nueva vacante</CardTitle>
            <CardDescription>Claude extrae requisitos y palabras clave.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
              {/* Cuatro opciones no caben en una fila de la columna: dos por fila. */}
              <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto">
                <TabsTrigger value="text">Pegar texto</TabsTrigger>
                <TabsTrigger value="url">Desde URL</TabsTrigger>
                <TabsTrigger value="image">Desde imagen</TabsTrigger>
                <TabsTrigger value="browser">Con Chrome</TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="pt-2">
                <Textarea
                  className="h-40 text-sm"
                  placeholder="Pega aquí la descripción completa de la vacante…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </TabsContent>
              <TabsContent value="url" className="flex flex-col gap-1 pt-2">
                <Input
                  type="url"
                  placeholder="https://empresa.com/careers/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Sitios con login (p. ej. LinkedIn) suelen bloquear la descarga: en ese caso pega
                  el texto.
                </p>
              </TabsContent>
              <TabsContent value="browser" className="flex flex-col gap-1 pt-2">
                <Label htmlFor="vacancy-browser-url">URL de la vacante</Label>
                <Input
                  id="vacancy-browser-url"
                  type="url"
                  placeholder="https://www.linkedin.com/jobs/view/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Claude abre la página en Chrome (MCP) y la lee como la verías tú. Tarda más que
                  "Desde URL".
                </p>
              </TabsContent>
              <TabsContent value="image" className="flex flex-col gap-1 pt-2">
                <Label htmlFor="vacancy-image">Captura de la vacante</Label>
                <Input
                  id="vacancy-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG o WebP de hasta 5 MB. Claude transcribe el texto de la imagen.
                </p>
              </TabsContent>
            </Tabs>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Quién la publicó y cuándo (opcional)
              </summary>
              <div className="pt-2">
                <PosterFields idPrefix="new" values={newPoster} onChange={setNewPoster} />
              </div>
            </details>
            <Button
              className="mt-3 w-full"
              onClick={add}
              disabled={
                adding ||
                (mode === "text"
                  ? text.trim().length < 80
                  : mode === "url" || mode === "browser"
                    ? !url.trim()
                    : !imageFile)
              }
            >
              {adding ? <Loader2 className="animate-spin" /> : <Plus />}
              {adding ? "Analizando…" : "Agregar vacante"}
            </Button>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Vacantes ({vacancies.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {vacancies.length === 0 && (
              <p className="text-sm text-muted-foreground">Aún no hay vacantes.</p>
            )}
            {vacancies.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={cn(
                  "flex flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted",
                  v.id === selectedId && "bg-muted",
                )}
              >
                <span className="text-sm font-medium">{v.title}</span>
                <span className="text-xs text-muted-foreground">
                  {v.company} · {new Date(v.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {!selected ? (
        <EmptyState title="Selecciona o agrega una vacante">
          Luego genera un CV alineado a ella con tu perfil.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{selected.title}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span>{selected.company}</span>
                {selected.location && <Badge variant="outline">{selected.location}</Badge>}
                {selected.seniority && <Badge variant="outline">{selected.seniority}</Badge>}
                <Badge variant="secondary">{selected.language.toUpperCase()}</Badge>
                <Badge variant="outline">{selected.platform}</Badge>
                {selected.sourceUrl && (
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline"
                  >
                    fuente <ExternalLink className="size-3" />
                  </a>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm">{selected.summary}</p>

              <section aria-label="Publicación" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">Publicación</span>
                  <span className="text-muted-foreground">{describePostedAt(selected)}</span>
                </div>
                <PosterFields
                  idPrefix="edit"
                  values={editPoster}
                  onChange={setEditPoster}
                  disabled={savingPoster}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={savePoster}
                  disabled={savingPoster}
                >
                  {savingPoster ? <Loader2 className="animate-spin" /> : <Save />} Guardar
                  publicación
                </Button>
              </section>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Cobertura de requisitos obligatorios</span>
                  <span className="tabular-nums">
                    {matching
                      ? "calculando…"
                      : match
                        ? `${Math.round(match.coverage * 100)}%`
                        : "-"}
                  </span>
                </div>
                <Progress value={match ? match.coverage * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  Estimación por similitud semántica con tu perfil. Pasa el cursor sobre cada
                  etiqueta para ver la evidencia. Lo “débil” son huecos: agrégalo a tu perfil si de
                  verdad lo tienes.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <MatchList
                  title="Obligatorios"
                  items={selected.mustHave}
                  matches={match?.requirements}
                />
                <MatchList
                  title="Deseables"
                  items={selected.niceToHave}
                  matches={match?.requirements}
                />
              </div>

              {selected.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.keywords.map((k) => (
                    <Badge key={k} variant="outline">
                      {k}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="instructions">Instrucciones extra (opcional)</Label>
                <Textarea
                  id="instructions"
                  className="h-16 text-sm"
                  placeholder="Ej.: máximo 1 página, enfatiza liderazgo, omite el proyecto X…"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
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
                <Button variant="ghost" onClick={() => remove(selected.id)} disabled={generating}>
                  <Trash2 /> Eliminar vacante
                </Button>
                {genStatus && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> {genStatus}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {streamed && (
            <div className="rounded-xl bg-muted/50 p-4">
              <CvPreview markdown={streamed} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
