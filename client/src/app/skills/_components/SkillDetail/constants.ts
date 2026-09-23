/** Tabs of the skill detail, in display order (`versions` is labelled "Versioning"). */
export const TABS = ["config", "preview", "stats", "versions"] as const;
export type SkillTab = (typeof TABS)[number];
export const DEFAULT_TAB: SkillTab = "config";
