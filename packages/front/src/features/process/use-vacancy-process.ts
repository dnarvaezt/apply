import type {
  Channel,
  ContactInput,
  MoveStatusRequest,
  NewApplicationContactRequest,
  VacancyProcess,
} from "@apply/shared";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { STATUS_LABEL } from "./process-labels";

async function fetchProcess(vacancyId: string) {
  const [process, channels] = await Promise.all([
    api.process.get(vacancyId),
    api.applications.channels(),
  ]);
  return { process, channels };
}

/** Corre la acción y avisa del resultado; resuelve `true` si salió bien. */
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

/** El proceso de una vacante: carga, mover el estado y gestionar sus contactos. */
export function useVacancyProcess(vacancyId: string) {
  const fetcher = useCallback(() => fetchProcess(vacancyId), [vacancyId]);
  const { load, reload, update } = useLoad<{ process: VacancyProcess; channels: Channel[] }>(
    fetcher,
  );
  const setProcess = (process: VacancyProcess) => update((d) => ({ ...d, process }));
  /** Corre la acción y vuelve a leer el proceso sin vaciar la vista. */
  const andRefresh = (run: () => Promise<unknown>, success: string) =>
    attempt(async () => {
      await run();
      setProcess(await api.process.get(vacancyId));
    }, success);

  return {
    load,
    reload,
    move: (req: MoveStatusRequest) =>
      attempt(
        async () => setProcess(await api.process.move(vacancyId, req)),
        `Movida a «${STATUS_LABEL[req.to]}»`,
      ),
    addContact: (req: NewApplicationContactRequest) =>
      andRefresh(() => api.contacts.add(vacancyId, req), "Contacto agregado"),
    updateContact: (contactId: string, input: ContactInput) =>
      andRefresh(() => api.contacts.update(contactId, input), "Contacto guardado"),
    markProcessStart: async (contactId: string, isProcessStart: boolean) => {
      await andRefresh(
        () => api.contacts.markProcessStart(vacancyId, contactId, isProcessStart),
        isProcessStart ? "Marcado como inicio del proceso" : "Inicio del proceso desmarcado",
      );
    },
  };
}
