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

/** What an install error becomes on screen: a known code gets our text, a server message is a fixed one. */
export type InstallErrorText = { kind: "workflowScope" } | { kind: "message"; message: string } | { kind: "generic" };

export function installErrorText(error: unknown): InstallErrorText | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.code === WORKFLOW_SCOPE_CODE) return { kind: "workflowScope" };
    // The server answers with its own fixed messages and never relays a GitHub body.
    if (error.message) return { kind: "message", message: error.message };
  }
  return { kind: "generic" };
}

/** The key that says whether the generated files still match the current choices. */
export function requestKey(repoId: string, triggers: readonly CiTrigger[], postAs: string): string {
  return `${repoId}|${triggers.join(",")}|${postAs}`;
}
