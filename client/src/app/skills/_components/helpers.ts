import type { Skill, SkillImportPreview, SkillType } from "@devdigest/shared";

/** The editable fields of a skill. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "rubric", body: "" };

export function draftFromSkill(skill: Skill): SkillDraft {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

export function draftFromPreview(p: SkillImportPreview): SkillDraft {
  return { name: p.name, description: p.description, type: p.type, body: p.body };
}

/** Name, description and body must all have text. */
export function isDraftValid(d: SkillDraft): boolean {
  return d.name.trim() !== "" && d.description.trim() !== "" && d.body.trim() !== "";
}

/** Only the fields that differ from `base` — the body of a PUT. */
export function changedFields(base: SkillDraft, next: SkillDraft): Partial<SkillDraft> {
  const out: Partial<SkillDraft> = {};
  if (next.name !== base.name) out.name = next.name;
  if (next.description !== base.description) out.description = next.description;
  if (next.type !== base.type) out.type = next.type;
  if (next.body !== base.body) out.body = next.body;
  return out;
}
