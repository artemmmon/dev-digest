import type { EvalRunStatus, Provider } from '@devdigest/shared';

/** Tunables and fixed texts of the eval pipeline. Nothing here touches I/O. */

/** One case that has not answered in this time is recorded as `error` (user decision: 120 s). */
export const EVAL_CASE_TIMEOUT_MS = 120_000;

/** An agent holds at most this many eval cases (AC-12). */
export const MAX_CASES_PER_AGENT = 50;

/** `GET /agents/:id/eval-runs?limit=` bounds. */
export const RUN_LIST_DEFAULT_LIMIT = 10;
export const RUN_LIST_MAX_LIMIT = 50;

/** The dashboard lists this many newest counted runs (AC-43). */
export const DASHBOARD_RECENT_RUNS = 6;

/** A run counts for outcomes, metrics, deltas, alerts and rows only in these statuses (AC-66). */
export const COUNTED_STATUSES: readonly EvalRunStatus[] = ['done', 'partial'];

/** Error codes of the API envelope. */
export const ERR = {
  caseLimit: 'eval_case_limit',
  caseExists: 'eval_case_exists',
  noCases: 'eval_no_cases',
  runInProgress: 'eval_run_in_progress',
  providerNotConfigured: 'provider_not_configured',
  findingAgentMismatch: 'finding_agent_mismatch',
  notCounted: 'eval_run_not_counted',
  differentAgents: 'eval_runs_of_different_agents',
} as const;

/** Fixed texts: the only strings that reach a client or a stored row (never a provider `err.message`). */
export const EXCLUDED_FILE_MESSAGE = 'This file is excluded from review and can never pass preparation';
export const CASE_LIMIT_MESSAGE = 'An agent can hold at most 50 eval cases.';
export const CASE_EXISTS_MESSAGE = 'An eval case from this finding already exists.';
export const CASE_DELETE_RUNNING_MESSAGE =
  'This agent has an eval run in progress. Delete the case after it finishes.';
export const NO_CASES_MESSAGE = 'Add a case first: this agent has no eval cases.';
export const RUN_IN_PROGRESS_MESSAGE = 'An eval run of this agent is already in progress.';
export const NO_HUNK_MESSAGE = 'The diff has no unified-diff hunk.';
export const NO_INTERSECT_MESSAGE = 'The expectation range does not intersect a hunk of the case diff for that file.';
export const FINDING_AGENT_MISMATCH_MESSAGE = 'The finding was not produced by this agent.';
export const NOT_COUNTED_MESSAGE = 'Only completed runs (done or partial) can be compared.';
export const DIFFERENT_AGENTS_MESSAGE = 'Both runs must belong to the same agent.';
export const SAME_RUN_MESSAGE = 'Choose two different runs to compare.';
/** `{provider}` is replaced with the provider's display name. */
export const MISSING_KEY_MESSAGE_TEMPLATE =
  'No API key is stored for {provider}. Add it in Settings and try again.';

export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

/** Start of the engine's task line (`Review pull request. <review rules>`); it carries no PR-author text. */
export const TASK_PREFIX = 'Review pull request';

/** Structured per-case result keeps at most this much of a finding title. */
export const FINDING_TITLE_MAX_CHARS = 200;
/** A stored result keeps at most this many findings (a runaway model cannot bloat the row). */
export const RESULT_FINDINGS_MAX = 200;
