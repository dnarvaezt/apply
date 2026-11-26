import { ExternalLink, Loader2, Plus, Sparkles, Square, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { CvDoc, MatchReport, Vacancy } from "../../../shared/types.ts";
import { MatchList } from "./match-list";

export function VacanciesPage({ onCvCreated }: { onCvCreated: (cv: CvDoc) => void }) {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [match, setMatch] = useState<MatchReport | null>(null);
  const [matching, setMatching] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [streamed, setStreamed] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const selected = vacancies.find((v) => v.id === selectedId) ?? null;

  useEffect(() => {
    api.vacancies
      .list()
      .then((list) => {
        setVacancies(list);
        setSelectedId(list[0]?.id ?? null);
      })
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
      const v = await api.vacancies.create(mode === "text" ? { text } : { url });
      setVacancies((prev) => [v, ...prev]);
      setSelectedId(v.id);
      setText("");
      setUrl("");
      toast.success(`Vacante analizada: ${v.title}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta vacante?")) return;
    await api.vacancies.remove(id);
    setVacancies((prev) => prev.filter((v) => v.id !== id));
    if (selectedId === id) setSelectedId(null);
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
            <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "url")}>
              <TabsList className="w-full">
                <TabsTrigger value="text">Pegar texto</TabsTrigger>
                <TabsTrigger value="url">Desde URL</TabsTrigger>
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
            </Tabs>
            <Button
              className="mt-3 w-full"
              onClick={add}
              disabled={adding || (mode === "text" ? text.trim().length < 80 : !url.trim())}
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
                onClick={() => setSelectedId(v.id)}
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
