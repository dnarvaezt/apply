"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";

/** Cambia el elemento abierto de una sección; `replace` no deja una entrada nueva en el historial. */
export type SelectRoute = (id: string | null, options?: { replace?: boolean }) => void;

/** Lee de la URL (`<base>/<param>`) el elemento abierto de una sección y navega para cambiarlo. */
export function useRouteSelection(base: string, param: string) {
  const params = useParams<Record<string, string | string[] | undefined>>();
  const router = useRouter();
  const raw = params[param];
  const selectedId = typeof raw === "string" ? safeDecode(raw) : null;

  const onSelect = useCallback<SelectRoute>(
    (id, options) => {
      const href = id === null ? base : `${base}/${encodeURIComponent(id)}`;
      if (options?.replace) router.replace(href);
      else router.push(href);
    },
    [base, router],
  );

  return { selectedId, onSelect };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
