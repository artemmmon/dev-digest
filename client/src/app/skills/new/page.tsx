import { redirect } from "next/navigation";

/* Route: /skills/new — creating a skill is a dialog on /skills now; this keeps old links working. */
export default function NewSkillPage() {
  redirect("/skills?create=1");
}
