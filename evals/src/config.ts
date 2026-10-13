/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? "claude-haiku-5-5";
export const EVAL_JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? "claude-sonnet-5-5";
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];
// `allowedTools` does not restrict a session under bypassPermissions: a skill that records an
// insight called Edit and appended to the live server/INSIGHTS.md. These are removed from the
// model's context, so the workflow tier cannot change the checkout it runs in.
export const WORKFLOW_DISALLOWED_TOOLS = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"];

// The agent tier runs a subagent the way production does, and architecture-reviewer's own method is
// mechanical checks through Bash (`pnpm arch`), which every recorded agent run used. So Bash stays
// reachable and only the file-editing tools are removed from the model's context.
export const AGENT_DISALLOWED_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

// Control session for trace cases that set `control: true`: the same prompt in an empty folder with
// no on-disk config, judged by the same practices. "1" runs it after the treatment; "only" skips
// the treatment, so a control costs one session and the treatment is not run a third time.
export const WORKFLOW_CONTROL = process.env.EVAL_CONTROL ?? "";

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
