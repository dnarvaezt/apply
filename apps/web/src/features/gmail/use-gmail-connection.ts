import type { GmailStatus } from "@apply/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const POLL_MS = 1500;
/** Igual que el plazo del loopback en la api: pasado ese tiempo el callback ya no llega. */
const WAIT_LIMIT_MS = 5 * 60_000;

export type GmailLoad =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; status: GmailStatus };

/** Estado de Gmail y conexión: abre Google en otra pestaña y consulta hasta ver la cuenta. */
export function useGmailConnection() {
  const [load, setLoad] = useState<GmailLoad>({ state: "loading" });
  const [waitingUrl, setWaitingUrl] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const reload = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      setLoad({ state: "ready", status: await api.gmail.status() });
    } catch (e) {
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Mientras Google tiene el consentimiento abierto, la api es la única que sabe cuándo termina.
  useEffect(() => {
    if (!waitingUrl) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      const status = await api.gmail.status().catch(() => null);
      if (stopped) return;
      if (status?.state === "connected") {
        setLoad({ state: "ready", status });
        setWaitingUrl(null);
        return;
      }
      if (Date.now() - startedAt >= WAIT_LIMIT_MS) {
        setWaitingUrl(null);
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waitingUrl]);

  const connect = useCallback(async () => {
    setTimedOut(false);
    // La pestaña se abre en el clic: abrirla después del await la bloquearía el navegador.
    const tab = window.open("", "_blank");
    try {
      const { authUrl } = await api.gmail.connect();
      if (tab) {
        tab.opener = null;
        tab.location.href = authUrl;
      }
      setWaitingUrl(authUrl);
    } catch (e) {
      tab?.close();
      setLoad({ state: "error", message: (e as Error).message });
    }
  }, []);

  return { load, waitingUrl, timedOut, reload, connect };
}
