import { Suspense } from "react";
import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab: a card grid). Thin route entry — the view, grid, preview drawer,
   create/import dialogs and i18n are colocated under _components. The view reads the URL search
   params, which needs a Suspense boundary so the route is not bailed out to client rendering. */
export default function SkillsPage() {
  return (
    <Suspense fallback={null}>
      <SkillsListView />
    </Suspense>
  );
}
