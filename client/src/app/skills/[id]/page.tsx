"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { SkillPageView } from "../_components/SkillPageView";

/* Route: /skills/:id — one skill: Config · Preview · Stats · Versioning. Thin route entry; the view
   reads the ?tab= search param, which needs a Suspense boundary. */
export default function SkillPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <SkillPageView id={id} />
    </Suspense>
  );
}
