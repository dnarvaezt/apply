import type { Vacancy } from "@apply/shared";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { readImageFile } from "./image-file";
import { PosterFields } from "./poster-fields";
import { EMPTY_POSTER_FORM, type PosterFormValues, toCreateFields } from "./poster-form";
import { canSubmitSource, type SourceInput, type SourceMode } from "./vacancy-form";

async function toSource(mode: SourceMode, input: SourceInput) {
  switch (mode) {
    case "text":
      return { text: input.text };
    case "url":
      return { url: input.url };
    case "browser":
      return { url: input.url, browser: true };
    case "image":
      if (!input.image) throw new Error("Elige una imagen");
      return { image: await readImageFile(input.image) };
  }
}

/** Alta de una vacante desde texto, URL, Chrome o imagen; Claude extrae requisitos y palabras clave. */
export function VacancyCreatePage({ onCreated }: { onCreated: (vacancy: Vacancy) => void }) {
  const [mode, setMode] = useState<SourceMode>("text");
  const [input, setInput] = useState<SourceInput>({ text: "", url: "", image: null });
  const [poster, setPoster] = useState<PosterFormValues>(EMPTY_POSTER_FORM);
  const [adding, setAdding] = useState(false);
  const set = (change: Partial<SourceInput>) => setInput((prev) => ({ ...prev, ...change }));

  async function add() {
    setAdding(true);
    try {
      const v = await api.vacancies.create({
        ...(await toSource(mode, input)),
        ...toCreateFields(poster),
      });
      toast.success(`Vacante analizada: ${v.title}`);
      onCreated(v);
    } catch (e) {
      toast.error((e as Error).message);
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" data-id="vacancy-create">
      <Link
        href="/vacancies"
        className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}
      >
        <ArrowLeft /> Vacantes
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nueva vacante</CardTitle>
          <CardDescription>
            Claude lee la vacante y extrae título, empresa, requisitos y palabras clave. Luego
            podrás corregirlos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)}>
            <TabsList className="grid w-full grid-cols-2 group-data-horizontal/tabs:h-auto sm:grid-cols-4">
              <TabsTrigger value="text">Pegar texto</TabsTrigger>
              <TabsTrigger value="url">Desde URL</TabsTrigger>
              <TabsTrigger value="image">Desde imagen</TabsTrigger>
              <TabsTrigger value="browser">Con Chrome</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="pt-2">
              <Textarea
                aria-label="Texto de la vacante"
                className="h-56 text-sm"
                placeholder="Pega aquí la descripción completa de la vacante…"
                value={input.text}
                onChange={(e) => set({ text: e.target.value })}
              />
            </TabsContent>
            <TabsContent value="url" className="flex flex-col gap-1 pt-2">
              <Label htmlFor="vacancy-url">URL de la vacante</Label>
              <Input
                id="vacancy-url"
                type="url"
                placeholder="https://empresa.com/careers/…"
                value={input.url}
                onChange={(e) => set({ url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Sitios con login (p. ej. LinkedIn) suelen bloquear la descarga: en ese caso usa "Con
                Chrome" o pega el texto.
              </p>
            </TabsContent>
            <TabsContent value="browser" className="flex flex-col gap-1 pt-2">
              <Label htmlFor="vacancy-browser-url">URL de la vacante</Label>
              <Input
                id="vacancy-browser-url"
                type="url"
                placeholder="https://www.linkedin.com/jobs/view/…"
                value={input.url}
                onChange={(e) => set({ url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Claude abre la página en una pestaña de tu Chrome, con tu sesión, y la lee como la
                verías tú. Requiere activar chrome://inspect/#remote-debugging. Tarda más que "Desde
                URL".
              </p>
            </TabsContent>
            <TabsContent value="image" className="flex flex-col gap-1 pt-2">
              <Label htmlFor="vacancy-image">Captura de la vacante</Label>
              <Input
                id="vacancy-image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => set({ image: e.target.files?.[0] ?? null })}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG o WebP de hasta 5 MB. Claude transcribe el texto de la imagen.
              </p>
            </TabsContent>
          </Tabs>
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Quién la publicó y cuándo (opcional)
            </summary>
            <div className="pt-3">
              <PosterFields idPrefix="new" values={poster} onChange={setPoster} />
            </div>
          </details>
          <Button
            className="self-end"
            onClick={add}
            disabled={adding || !canSubmitSource(mode, input)}
          >
            {adding ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {adding ? "Analizando…" : "Analizar vacante"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
