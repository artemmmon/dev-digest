import type { SkillDraft } from "../../../helpers";

/** The editing state SkillDetail owns and ConfigTab renders: the draft, its status and what to do with it. */
export interface ConfigForm {
  draft: SkillDraft;
  onDraft: (draft: SkillDraft) => void;
  /** What changed, kept with the new version; only asked for when the body changed. */
  message: string;
  onMessage: (message: string) => void;
  dirty: boolean;
  bodyChanged: boolean;
  valid: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
}
