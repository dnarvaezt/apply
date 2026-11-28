import { redirect } from "next/navigation";

/** Las postulaciones viven en el detalle de su vacante. */
export default function Page() {
  redirect("/vacancies");
}
