"use client";

import { useRouteSelection } from "@/lib/route-selection";
import { ApplicationsPage } from "./applications-page";

/** Conecta la vista con la URL: `/applications` es la lista y `/applications/[id]` el elemento abierto. */
export function ApplicationsRoute() {
  const { selectedId, onSelect } = useRouteSelection("/applications", "id");
  return <ApplicationsPage selectedId={selectedId} onSelect={onSelect} />;
}
