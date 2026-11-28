"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LoadState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

/**
 * Carga `fetch` al montar y cada vez que cambia (memorízalo con `useCallback`); descarta la
 * respuesta de una carga anterior. `update` cambia los datos ya cargados sin volver a pedirlos.
 */
export function useLoad<T>(fetch: () => Promise<T>) {
  const [load, setLoad] = useState<LoadState<T>>({ state: "loading" });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current;
    setLoad({ state: "loading" });
    try {
      const data = await fetch();
      if (call === latest.current) setLoad({ state: "ready", data });
    } catch (e) {
      if (call === latest.current) setLoad({ state: "error", message: (e as Error).message });
    }
  }, [fetch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback((change: (data: T) => T) => {
    setLoad((l) => (l.state === "ready" ? { state: "ready", data: change(l.data) } : l));
  }, []);

  return { load, reload, update };
}
