import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab: list + editor). Thin route entry — the view, list, editor,
   import dialog and i18n are colocated under _components. */
export default function SkillsPage() {
  return <SkillsListView />;
}
