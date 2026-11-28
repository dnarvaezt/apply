import { redirect } from "next/navigation";

/** Los CVs viven en el detalle de su vacante. */
export default function Page() {
  redirect("/vacancies");
}
