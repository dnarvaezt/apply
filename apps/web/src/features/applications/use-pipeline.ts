import type { ApplicationEvent, CreateApplicationRequest, CvMeta, Vacancy } from "@apply/shared";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { type PipelineRow, toPipelineRows } from "./pipeline";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; rows: PipelineRow[]; vacancies: Vacancy[]; cvs: CvMeta[] };

/** Estado de la pantalla de postulaciones: carga, selección, línea de tiempo y alta. */
export function usePipeline() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[] | null>(null);

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const [applications, vacancies, cvs] = await Promise.all([
        api.applications.list(),
        api.vacancies.list(),
        api.cvs.list(),
      ]);
      setLoad({ state: "ready", rows: toPipelineRows(applications, vacancies), vacancies, cvs });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function select(id: string) {
    setSelectedId(id);
    setEvents(null);
    try {
      setEvents((await api.applications.timeline(id)).events);
    } catch (e) {
      toast.error(`Línea de tiempo: ${(e as Error).message}`);
    }
  }

  async function create(req: Pick<CreateApplicationRequest, "vacancyId" | "cvId">) {
    try {
      const created = await api.applications.create(req);
      toast.success("Postulación registrada");
      await reload();
      await select(created.id);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  return { load, selectedId, events, reload, select, create };
}
