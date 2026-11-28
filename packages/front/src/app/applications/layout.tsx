import type { ReactNode } from "react";
import { ApplicationsRoute } from "@/features/applications/applications-route";

/** La vista vive en el layout para conservar su estado al pasar de la lista al detalle. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ApplicationsRoute />
      {children}
    </>
  );
}
