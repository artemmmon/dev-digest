import { parseDocument } from "yaml";
import type { CiFile, CiPreview, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ALL_TRIGGERS, WORKFLOW_SCOPE_CODE } from "./constants";

/** The generated workflow: the one file the user may edit. */
export function workflowFile(preview: CiPreview | undefined): CiFile | undefined {
  return preview?.files.find((f) => f.editable);
}

/** `true` when `text` parses as YAML; an empty text is not a workflow (AC-18). */
export function isValidYaml(text: string): boolean {
  return text.trim() !== "" && parseDocument(text).errors.length === 0;
}

/** Add or remove one trigger, keeping the order the Configure step lists them in. */
export function toggleTrigger(current: readonly CiTrigger[], trigger: CiTrigger): CiTrigger[] {
  const next = new Set(current);
  if (next.has(trigger)) next.delete(trigger);
  else next.add(trigger);
  return ALL_TRIGGERS.filter((t) => next.has(t));
}

/** `1.2 MB` / `340 KB` / `12 B` for a runner file shown in place of its contents (AC-15). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * What an install error becomes on screen: a known code gets our text (`key` under the `ci` namespace),
 * a server message is a fixed one shown as is.
 */
export type InstallErrorText =
  | { key: "wizard.install.errors.workflowScope" | "wizard.install.errors.generic" }
  | { message: string };

export function installErrorText(error: unknown): InstallErrorText | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.code === WORKFLOW_SCOPE_CODE) return { key: "wizard.install.errors.workflowScope" };
    // The server answers with its own fixed messages and never relays a GitHub body.
    if (error.message) return { message: error.message };
  }
  return { key: "wizard.install.errors.generic" };
}

/** What `canContinueFrom` needs to know about the wizard. */
export interface ContinueState {
  hasRepo: boolean;
  previewPending: boolean;
  hasPreview: boolean;
  triggerCount: number;
}

/** Whether "Continue" is enabled on `step` (0 Target, 1 Preview, 2 Configure; the Install step has its own button). */
export function canContinueFrom(step: number, state: ContinueState): boolean {
  switch (step) {
    case 0:
      return state.hasRepo && !state.previewPending;
    case 1:
      return state.hasPreview;
    case 2:
      return state.triggerCount > 0 && !state.previewPending && state.hasPreview;
    default:
      return false;
  }
}

/** The key that says whether the generated files still match the current choices. */
export function requestKey(repoId: string, triggers: readonly CiTrigger[], postAs: string): string {
  return `${repoId}|${triggers.join(",")}|${postAs}`;
}
