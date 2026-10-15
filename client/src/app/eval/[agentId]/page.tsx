/* /eval/:agentId — one agent on the Eval Dashboard: metric cards, runs table, Compare (SPEC-13).
   Thin route entry; the view and the compare modal are colocated under _components. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { EvalAgentView } from "./_components/EvalAgentView";

export default function EvalAgentPage() {
  const { agentId } = useParams<{ agentId: string }>();
  return <EvalAgentView agentId={agentId} />;
}
