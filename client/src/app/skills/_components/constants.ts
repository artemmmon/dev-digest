import type { SkillType } from "@devdigest/shared";

/** Types offered when writing a skill, in display order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Query param that holds the selected skill on /skills. */
export const SELECTION_PARAM = "skill";

/** Value of the selection param for an unsaved draft. */
export const NEW_SKILL = "new";

/** Query param that holds the open tab of the selected skill (absent = Config). */
export const TAB_PARAM = "tab";
