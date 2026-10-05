/* Onboarding Tour — /repos/:repoId/onboarding. Thin: the view owns the data and the state. */
"use client";

import { useParams } from "next/navigation";
import { TourView } from "./_components/TourView";

export default function OnboardingTourPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <TourView repoId={repoId} />;
}
