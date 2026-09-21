/** Tabs of the skill detail, in display order. `stats` and `versions` need a saved skill. */
export const TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof TABS)[number];
export const DEFAULT_TAB: SkillTab = "config";

/** Tabs that make sense for an unsaved draft. */
export const DRAFT_TABS: readonly SkillTab[] = ["config", "preview"];
