import { Suspense } from "react";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

/* Route: /agent-performance (Agent Performance). Thin route entry — the view, its states and i18n are
   colocated under _components. The view keeps the period in the URL search params, which needs a Suspense
   boundary so the route is not bailed out to client rendering. */
export default function AgentPerformancePage() {
  return (
    <Suspense fallback={null}>
      <AgentPerformanceView />
    </Suspense>
  );
}
