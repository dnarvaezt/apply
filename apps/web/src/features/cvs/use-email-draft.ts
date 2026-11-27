import type { EmailDraft, EmailDraftChanges } from "@apply/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; draft: EmailDraft | null };

type Busy = "idle" | "generating" | "saving";

/** Borrador del correo de un CV: carga, generación con el LLM y guardado (#19). */
export function useEmailDraft(cvId: string) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      setLoad({ state: "ready", draft: await api.emailDrafts.forCv(cvId) });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, [cvId]);

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

  return { load, busy, error, saved, reload, generate, save };
}
