import type { ReactNode } from "react";
import { CvsRoute } from "@/features/cvs/cvs-route";

/** La vista vive en el layout para conservar su estado al pasar de la lista al detalle. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <CvsRoute />
      {children}
    </>
  );
}
