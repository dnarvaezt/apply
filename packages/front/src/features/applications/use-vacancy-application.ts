import type {
  AddEventRequest,
  ApplicationTimeline,
  Channel,
  ContactInput,
  CreateApplicationRequest,
  NewApplicationContactRequest,
} from "@apply/shared";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { currentApplication } from "./pipeline";

interface VacancyApplication {
  /** Línea de tiempo de la postulación vigente; `null` si aún no se postuló. */
  timeline: ApplicationTimeline | null;
  channels: Channel[];
}

async function fetchVacancyApplication(vacancyId: string): Promise<VacancyApplication> {
  const [applications, channels] = await Promise.all([
    api.applications.list(vacancyId),
    api.applications.channels(),
  ]);
  const current = currentApplication(applications);
  return { timeline: current && (await api.applications.timeline(current.id)), channels };
}

/** Corre la acción y avisa del error; resuelve `true` si salió bien. */
async function attempt(run: () => Promise<unknown>, success: string): Promise<boolean> {
  try {
    await run();
    toast.success(success);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}

/** La postulación de una vacante: carga, alta y registro manual de eventos y contactos. */
export function useVacancyApplication(vacancyId: string) {
  const fetcher = useCallback(() => fetchVacancyApplication(vacancyId), [vacancyId]);
  const { load, reload, update } = useLoad(fetcher);

  /** Corre la acción y vuelve a leer la línea de tiempo (el estado pudo cambiar) sin vaciar la vista. */
  const andRefresh = (run: () => Promise<unknown>, success: string) =>
    attempt(async () => {
      await run();
      const fresh = await fetchVacancyApplication(vacancyId);
      update(() => fresh);
    }, success);

  const applicationId = load.state === "ready" ? load.data.timeline?.application.id : undefined;
  const inApplication = (run: (id: string) => Promise<unknown>, success: string) =>
    applicationId === undefined
      ? Promise.resolve(false)
      : andRefresh(() => run(applicationId), success);

  return {
    load,
    reload,
    create: (req: Omit<CreateApplicationRequest, "vacancyId">) =>
      andRefresh(() => api.applications.create({ ...req, vacancyId }), "Postulación registrada"),
    addEvent: (req: AddEventRequest) =>
      inApplication((id) => api.applications.addEvent(id, req), "Evento registrado"),
    addContact: (req: NewApplicationContactRequest) =>
      inApplication(() => api.contacts.add(vacancyId, req), "Contacto agregado"),
    updateContact: (contactId: string, input: ContactInput) =>
      inApplication(() => api.contacts.update(contactId, input), "Contacto guardado"),
    markProcessStart: async (contactId: string, isProcessStart: boolean) => {
      await inApplication(
        () => api.contacts.markProcessStart(vacancyId, contactId, isProcessStart),
        isProcessStart ? "Marcado como inicio del proceso" : "Inicio del proceso desmarcado",
      );
    },
  };
}
