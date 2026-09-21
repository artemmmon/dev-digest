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
 * The tab's one list, in prompt order: every skill the agent has a binding for (checked or
 * not, at its saved position), then the skills it was never bound to — unchecked, in the
 * workspace's order. Bindings whose skill no longer exists are dropped.
 */
export function orderedBindings(links: AgentSkillLink[], skills: Skill[]): Binding[] {
  const known = new Set(skills.map((sk) => sk.id));
  const bound = toBindings(links).filter((b) => known.has(b.skill_id));
  const seen = new Set(bound.map((b) => b.skill_id));
  const rest = skills.filter((sk) => !seen.has(sk.id)).map((sk) => ({ skill_id: sk.id, enabled: false }));
  return [...bound, ...rest];
}

/**
 * Move the binding at `from` to position `to` (the drag-and-drop target). A no-op — same
 * index, or an index outside the list — returns the SAME array, so callers can skip the save.
 */
export function moveBindingTo(bindings: Binding[], from: number, to: number): Binding[] {
  if (from === to || from < 0 || from >= bindings.length || to < 0 || to >= bindings.length) return bindings;
  const next = [...bindings];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Move the binding at `index` by one position (ArrowUp/ArrowDown on the grip); off either end returns the same array. */
export function moveBinding(bindings: Binding[], index: number, delta: -1 | 1): Binding[] {
  return moveBindingTo(bindings, index, index + delta);
}

export function setBindingEnabled(bindings: Binding[], skillId: string, enabled: boolean): Binding[] {
  return bindings.map((b) => (b.skill_id === skillId ? { ...b, enabled } : b));
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
