import type { Skill, SkillImportPreview, SkillType } from "@devdigest/shared";
import { parseAppliesTo } from "@/lib/applies-to-presets";

export { parseAppliesTo };

/** The editable fields of a skill. `appliesTo` is the raw comma-separated text the
    user types; `parseAppliesTo` turns it into the wire's `string[] | null`. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  appliesTo: string;
}

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "rubric", body: "", appliesTo: "" };

export function draftFromSkill(skill: Skill): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    appliesTo: (skill.applies_to ?? []).join(", "),
  };
}

export function draftFromPreview(p: SkillImportPreview): SkillDraft {
  return {
    name: p.name,
    description: p.description,
    type: p.type,
    body: p.body,
    appliesTo: (p.applies_to ?? []).join(", "),
  };
}

/** Name, description and body must all have text. */
export function isDraftValid(d: SkillDraft): boolean {
  return d.name.trim() !== "" && d.description.trim() !== "" && d.body.trim() !== "";
}

/** The body of a PUT — only the fields that differ from `base`. */
export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  applies_to?: string[] | null;
}

export function changedFields(base: SkillDraft, next: SkillDraft): SkillPatch {
  const out: SkillPatch = {};
  if (next.name !== base.name) out.name = next.name;
  if (next.description !== base.description) out.description = next.description;
  if (next.type !== base.type) out.type = next.type;
  if (next.body !== base.body) out.body = next.body;
  if (next.appliesTo !== base.appliesTo) out.applies_to = parseAppliesTo(next.appliesTo);
  return out;
}
