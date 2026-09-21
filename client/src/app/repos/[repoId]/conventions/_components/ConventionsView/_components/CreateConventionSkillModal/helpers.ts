import type { Agent, ConventionSkillCreate } from "@devdigest/shared";
import { NO_AGENT } from "./constants";

export interface SkillFormValues {
  name: string;
  description: string;
  body: string;
  agentId: string;
}

/** Whether the form can be submitted: every text field has content. */
export function isFormComplete(v: SkillFormValues): boolean {
  return v.name.trim() !== "" && v.description.trim() !== "" && v.body.trim() !== "";
}

/** The request body for `POST …/conventions/skills`. */
export function buildCreatePayload(ids: string[], v: SkillFormValues): ConventionSkillCreate {
  return {
    convention_ids: ids,
    name: v.name.trim(),
    description: v.description.trim(),
    body: v.body,
    agent_id: v.agentId === NO_AGENT ? null : v.agentId,
  };
}

/** Options of the agent select: "no agent" first, then every agent by name. */
export function agentOptions(agents: Agent[], noAgentLabel: string): { value: string; label: string }[] {
  return [{ value: NO_AGENT, label: noAgentLabel }, ...agents.map((a) => ({ value: a.id, label: a.name }))];
}
