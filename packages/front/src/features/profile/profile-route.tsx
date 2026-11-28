"use client";

import { useRouteSelection } from "@/lib/route-selection";
import { ProfilePage } from "./profile-page";

/** Conecta la vista con la URL: `/profile` es la lista y `/profile/[file]` el elemento abierto. */
export function ProfileRoute() {
  const { selectedId, onSelect } = useRouteSelection("/profile", "file");
  return <ProfilePage selectedId={selectedId} onSelect={onSelect} />;
}
