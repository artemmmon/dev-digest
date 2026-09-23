import type { SkillType } from "@devdigest/shared";

/** Types offered when writing a skill, in display order. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Query param that holds the skill whose preview drawer is open on /skills. */
export const SELECTION_PARAM = "skill";

/** Query param that opens the Create dialog on /skills (`?create=1`); `/skills/new` redirects to it. */
export const CREATE_PARAM = "create";
export const CREATE_ON = "1";

/** Query param that holds the open tab of a skill on /skills/<id> (absent = Config). */
export const TAB_PARAM = "tab";
