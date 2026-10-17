import { Suspense } from "react";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs (CI Runs). Thin route entry — the view, its filters, states and i18n are colocated under
   _components. The view keeps the filters in the URL search params, which needs a Suspense boundary so the
   route is not bailed out to client rendering. */
export default function CiRunsPage() {
  return (
    <Suspense fallback={null}>
      <CiRunsView />
    </Suspense>
  );
}
