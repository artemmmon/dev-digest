import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One binding as the API takes it; array order is the prompt order. */
export interface Binding {
  skill_id: string;
  enabled: boolean;
}

export function toBindings(links: AgentSkillLink[]): Binding[] {
  return [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({ skill_id: l.skill_id, enabled: l.enabled }));
}

/**
 * The tab's one list, in prompt order, in three blocks: the skills this agent uses (at their saved
 * relative order), then the ones it has a binding for but switched off, then the skills it was never
 * bound to — off, in the workspace's order. Enabled rows come first so the part of the list that
 * reaches the prompt (and can be re-ordered) is one contiguous block. Bindings whose skill no longer
 * exists are dropped.
 */
export function orderedBindings(links: AgentSkillLink[], skills: Skill[]): Binding[] {
  const known = new Set(skills.map((sk) => sk.id));
  const bound = toBindings(links).filter((b) => known.has(b.skill_id));
  const seen = new Set(bound.map((b) => b.skill_id));
  const rest = skills.filter((sk) => !seen.has(sk.id)).map((sk) => ({ skill_id: sk.id, enabled: false }));
  return [...bound.filter((b) => b.enabled), ...bound.filter((b) => !b.enabled), ...rest];
}

/**
 * Move the binding at `from` to position `to` (the drag-and-drop target). Only enabled rows take
 * part: a disabled row can be neither moved nor be a drop target. A no-op — same index, an index
 * outside the list, or a disabled row on either end — returns the SAME array, so callers can skip the save.
 */
export function moveBindingTo(bindings: Binding[], from: number, to: number): Binding[] {
  if (from === to || from < 0 || from >= bindings.length || to < 0 || to >= bindings.length) return bindings;
  if (!bindings[from]!.enabled || !bindings[to]!.enabled) return bindings;
  const next = [...bindings];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Move the binding at `index` by one position (ArrowUp/ArrowDown on the grip); off the enabled block returns the same array. */
export function moveBinding(bindings: Binding[], index: number, delta: -1 | 1): Binding[] {
  return moveBindingTo(bindings, index, index + delta);
}

/**
 * Switch one binding on or off and keep the enabled-first invariant: a row switched on goes to the
 * END of the enabled block (the last skill in the prompt), one switched off to the START of the
 * disabled block (right under the enabled ones).
 */
export function setBindingEnabled(bindings: Binding[], skillId: string, enabled: boolean): Binding[] {
  const from = bindings.findIndex((b) => b.skill_id === skillId);
  if (from < 0 || bindings[from]!.enabled === enabled) return bindings;
  const rest = bindings.filter((_, i) => i !== from);
  const enabledCount = rest.filter((b) => b.enabled).length;
  rest.splice(enabledCount, 0, { skill_id: skillId, enabled });
  return rest;
}

/** How many bindings reach the prompt: binding on AND the skill itself on. */
export function countActive(bindings: Binding[], skills: Skill[]): number {
  const on = new Set(skills.filter((s) => s.enabled).map((s) => s.id));
  return bindings.filter((b) => b.enabled && on.has(b.skill_id)).length;
}

/** Case-insensitive filter over name + description. */
export function matchesFilter(skill: Skill, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return !q || `${skill.name} ${skill.description}`.toLowerCase().includes(q);
}
