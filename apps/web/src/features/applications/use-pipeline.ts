import type {
  AddEventRequest,
  ApplicationTimeline,
  Channel,
  ContactInput,
  CreateApplicationRequest,
  CvMeta,
  NewApplicationContactRequest,
  Vacancy,
} from "@apply/shared";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { type PipelineRow, toPipelineRows } from "./pipeline";

type Ready = {
  state: "ready";
  rows: PipelineRow[];
  vacancies: Vacancy[];
  cvs: CvMeta[];
  channels: Channel[];
};
type Load = { state: "loading" } | { state: "error"; message: string } | Ready;

async function fetchPipeline(): Promise<Ready> {
  const [applications, vacancies, cvs, channels] = await Promise.all([
    api.applications.list(),
    api.vacancies.list(),
    api.cvs.list(),
    api.applications.channels(),
  ]);
  return {
    state: "ready",
    rows: toPipelineRows(applications, vacancies),
    vacancies,
    cvs,
    channels,
  };
}

/** Corre la acción y avisa del error; resuelve `true` si salió bien. */
async function attempt(run: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await run();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}

/**
 * Estado de la pantalla de postulaciones: carga, selección, línea de tiempo con sus contactos,
 * alta de postulaciones y registro manual de eventos y contactos.
 */
export function usePipeline() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ApplicationTimeline | null>(null);

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      setLoad(await fetchPipeline());
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function select(id: string) {
    setSelectedId(id);
    setTimeline(null);
    try {
      setTimeline(await api.applications.timeline(id));
    } catch (e) {
      toast.error(`Línea de tiempo: ${(e as Error).message}`);
    }
  }

  /** Vuelve a leer la línea de tiempo y la lista (el estado pudo cambiar) sin vaciar la vista. */
  async function refresh(id: string) {
    const [view, pipeline] = await Promise.all([api.applications.timeline(id), fetchPipeline()]);
    setTimeline(view);
    setLoad(pipeline);
  }

  async function create(req: CreateApplicationRequest) {
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

  function inSelected(run: (id: string) => Promise<unknown>, success: string) {
    const id = selectedId;
    if (id === null) return Promise.resolve(false);
    return attempt(async () => {
      await run(id);
      await refresh(id);
    }, success);
  }

  const addEvent = (req: AddEventRequest) =>
    inSelected((id) => api.applications.addEvent(id, req), "Evento registrado");
  const addContact = (req: NewApplicationContactRequest) =>
    inSelected((id) => api.contacts.add(id, req), "Contacto agregado");
  const updateContact = (contactId: string, input: ContactInput) =>
    inSelected(() => api.contacts.update(contactId, input), "Contacto guardado");
  const markProcessStart = async (contactId: string, isProcessStart: boolean) => {
    await inSelected(
      (id) => api.contacts.markProcessStart(id, contactId, isProcessStart),
      isProcessStart ? "Marcado como inicio del proceso" : "Inicio del proceso desmarcado",
    );
  };

  return {
    load,
    selectedId,
    timeline,
    reload,
    select,
    create,
    addEvent,
    addContact,
    updateContact,
    markProcessStart,
  };
}
