"use client";

import { useRouteSelection } from "@/lib/route-selection";
import { CvsPage } from "./cvs-page";

/** Conecta la vista con la URL: `/cvs` es la lista y `/cvs/[id]` el elemento abierto. */
export function CvsRoute() {
  const { selectedId, onSelect } = useRouteSelection("/cvs", "id");
  return <CvsPage selectedId={selectedId} onSelect={onSelect} />;
}
