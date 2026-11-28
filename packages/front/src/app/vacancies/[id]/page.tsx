import { Suspense } from "react";
import { VacancyDetailRoute } from "@/features/vacancies/vacancy-routes";

/** `useSearchParams` exige un límite de Suspense. */
export default function Page() {
  return (
    <Suspense>
      <VacancyDetailRoute />
    </Suspense>
  );
}
