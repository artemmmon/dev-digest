import type { CiPostAs, CiTrigger } from "@devdigest/shared";

export const WIZARD_WIDTH = 720;

/** The four steps in order; the labels come from `ci.wizard.steps.<key>`. */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Every trigger the workflow can listen to, in the order the Configure step lists them. */
export const ALL_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
/** Selected when the wizard opens fresh (AC-26). */
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";
export const POST_AS_OPTIONS: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];

/** The server refuses a longer workflow (`CiInstallInput.workflow`); the textarea stops at the same size. */
export const MAX_WORKFLOW_CHARS = 64 * 1024;

/** The server's code for a token that cannot write `.github/workflows` (AC-57). */
export const WORKFLOW_SCOPE_CODE = "github_workflow_scope";

/** The OpenRouter-key badge per `secret_status`; `unknown` is neutral and distinct from set / not set (AC-33, NFR-13). */
export const SECRET_BADGES = {
  present: { key: "set", color: "var(--ok)", bg: "var(--ok-bg)", style: undefined },
  missing: { key: "notSet", color: "var(--warn)", bg: "var(--warn-bg)", style: undefined },
  unknown: {
    key: "unknown",
    color: "var(--text-muted)",
    bg: "var(--bg-surface)",
    style: { border: "1px solid var(--border)" },
  },
} as const;

/** The GitHub Actions documentation the Install step links to (AC-135); a constant, never built from data. */
export const GHA_DOCS_URL = "https://docs.github.com/en/actions";
