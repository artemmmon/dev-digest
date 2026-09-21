import { redirect } from "next/navigation";

/* Route: /skills/new — the editor is part of /skills now; this keeps old links working. */
export default function NewSkillPage() {
  redirect("/skills?skill=new");
}
