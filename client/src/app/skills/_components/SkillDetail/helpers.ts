import { TABS, type SkillTab } from "./constants";

/** Narrow a ?tab= value; anything unknown falls back to `fallback`. */
export function parseTab(value: string | null, fallback: SkillTab): SkillTab {
  return TABS.find((t) => t === value) ?? fallback;
}

/** Rough token count for text the server has not counted yet (an unsaved edit): ~4 characters each. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
