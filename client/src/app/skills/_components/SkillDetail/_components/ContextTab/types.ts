/** What SkillDetail owns and the Context tab renders: the list being edited and how to save it. */
export interface ContextForm {
  /** The active repository, or null when there is none. */
  repoId: string | null;
  /** The saved list for that repository; undefined until it has loaded. */
  saved: string[] | undefined;
  loadFailed: boolean;
  onRetry: () => void;
  /** The list on screen: the draft if the user changed it, else the saved one. */
  paths: string[];
  onPaths: (paths: string[]) => void;
  /** The skill has unsaved edits (fields or this list). */
  dirty: boolean;
  valid: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
}
