import { redirect } from "next/navigation";

/* Route: /skills/:id — the editor is part of /skills now; this keeps old links working. */
export default async function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/skills?skill=${encodeURIComponent(id)}`);
}
