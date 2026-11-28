import type { EmailDraft, EmailDraftChanges } from "@apply/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; draft: EmailDraft | null };

type Busy = "idle" | "generating" | "saving" | "sending";

/** Correo de un CV: carga, generación con el LLM y guardado (#19), envío con Gmail (#21). */
export function useEmailDraft(cvId: string) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Lee el correo sin vaciar la vista: tras un envío fallido muestra el estado real. */
  const refresh = useCallback(async () => {
    try {
      setLoad({ state: "ready", draft: await api.emailDrafts.forCv(cvId) });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, [cvId]);

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(kind: Exclude<Busy, "idle">, call: () => Promise<EmailDraft>) {
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      setLoad({ state: "ready", draft: await call() });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy("idle");
    }
  }

  const generate = () => run("generating", () => api.emailDrafts.generate(cvId));

  async function save(id: string, changes: EmailDraftChanges) {
    setSaved(await run("saving", () => api.emailDrafts.save(id, changes)));
  }

  /** Un error deja el estado del servidor en duda (pudo pasar a `sending` o volver a `draft`). */
  async function sendStep(call: () => Promise<EmailDraft>) {
    if (!(await run("sending", call))) await refresh();
  }

  const send = (id: string) => sendStep(() => api.emailDrafts.send(id));
  const resolve = (id: string, sent: boolean) => sendStep(() => api.emailDrafts.resolve(id, sent));

  return { load, busy, error, saved, reload, generate, save, send, resolve };
}
