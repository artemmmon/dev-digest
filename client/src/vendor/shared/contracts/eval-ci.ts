import { z } from 'zod';
import { Verdict, Finding } from './findings';
import { EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — cases, run-level runs, compare, dashboard (L06)
// ===========================================================================

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/**
 * What a case expects: a finding on `file` intersecting [start_line, end_line]
 * (`must_find`) or no such finding (`must_not_flag`). The refine path is
 * `end_line`, so a 422 names the failing field.
 */
export const EvalExpectation = z
  .object({
    type: EvalExpectationType,
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  })
  .refine((v) => v.start_line <= v.end_line, {
    path: ['end_line'],
    message: 'end_line must be greater than or equal to start_line',
  });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

/** The PR text a case replays (body may be empty). */
export const EvalCaseMeta = z.object({
  pr_title: z.string(),
  pr_body: z.string(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

/** Body of `POST /agents/:id/eval-cases` (and the edit route). */
export const EvalCaseSave = z.object({
  name: z.string().trim().min(1).max(120),
  input_diff: z.string().min(1).max(100_000),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectation,
  source_finding_id: z.string().uuid().nullish(),
});
export type EvalCaseSave = z.infer<typeof EvalCaseSave>;

export const EvalCaseOutcome = z.enum(['pass', 'fail', 'error', 'never_run']);
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcome>;

/** One case as listed on an agent's Evals tab, with its latest counted outcome. */
export const EvalCaseRecord = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectation,
  source_finding_id: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  latest: z.object({
    status: EvalCaseOutcome,
    expected_count: z.number().int(),
    matched_count: z.number().int().nullable(),
  }),
});
export type EvalCaseRecord = z.infer<typeof EvalCaseRecord>;

export const EvalRunStatus = z.enum(['running', 'done', 'partial', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/** A skill bound to the agent at run start, with its version then. */
export const EvalSkillVersion = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.number().int(),
});
export type EvalSkillVersion = z.infer<typeof EvalSkillVersion>;

/**
 * One eval run of an agent. Metrics and cost are nullable (no counted data).
 * Progress `k` of `cases_total` = `cases_completed + cases_errored`.
 */
export const EvalRunSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  skill_versions: z.array(EvalSkillVersion),
  status: EvalRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_completed: z.number().int(),
  cases_errored: z.number().int(),
  cases_passed: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  unlabelled_findings: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;

/** Response of `POST /agents/:id/eval-runs` (202). */
export const EvalRunStarted = z.object({
  run_id: z.string(),
  status: z.literal('running'),
});
export type EvalRunStarted = z.infer<typeof EvalRunStarted>;

/** Response of `GET /agents/:id/eval-runs`: newest first, plus the two latest counted runs. */
export const EvalRunsOverview = z.object({
  runs: z.array(EvalRunSummary),
  latest_counted: EvalRunSummary.nullable(),
  previous_counted: EvalRunSummary.nullable(),
});
export type EvalRunsOverview = z.infer<typeof EvalRunsOverview>;

/** One finding a case run produced (what the scorer compared against the expectation). */
export const EvalCaseFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
});
export type EvalCaseFinding = z.infer<typeof EvalCaseFinding>;

/** Stored per-case result of a run; the API exposes it only inside compare. */
export const EvalCaseResult = z.object({
  case_id: z.string(),
  status: z.enum(['pass', 'fail', 'error']),
  expected_count: z.number().int(),
  matched_count: z.number().int(),
  kept: z.number().int(),
  dropped: z.number().int(),
  findings: z.array(EvalCaseFinding),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

/** One side of a compare: the run plus the prompt and model it ran with. */
export const EvalCompareSide = z.object({
  run: EvalRunSummary,
  system_prompt: z.string().nullable(),
  model: z.string().nullable(),
});
export type EvalCompareSide = z.infer<typeof EvalCompareSide>;

/** Response of `GET /eval-runs/compare?a=&b=`. */
export const EvalCompare = z.object({
  older: EvalCompareSide,
  newer: EvalCompareSide,
  flipped: z.array(
    z.object({
      case_id: z.string(),
      name: z.string(),
      from: z.enum(['pass', 'fail']),
      to: z.enum(['pass', 'fail']),
    }),
  ),
  case_sets_differ: z.boolean(),
  only_in_older: z.number().int(),
  only_in_newer: z.number().int(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** Response of `GET /eval/dashboard`: every agent's latest run plus the newest counted runs. */
export const EvalDashboardOverview = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      name: z.string(),
      latest: EvalRunSummary.nullable(),
    }),
  ),
  recent_runs: z.array(EvalRunSummary.extend({ agent_name: z.string() })),
});
export type EvalDashboardOverview = z.infer<typeof EvalDashboardOverview>;

/** One counted run on an agent's trend chart: the three metrics, the version and the cost. */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  started_at: z.string(),
  agent_version: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Response of `GET /agents/:id/eval-trend`: every counted run, oldest first. */
export const EvalTrend = z.object({ points: z.array(EvalTrendPoint) });
export type EvalTrend = z.infer<typeof EvalTrend>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

/** Version of the manifest format written by the studio and read by the runner. */
export const MANIFEST_VERSION = 1;
/** Version of the bundled agent-runner; written into every result it produces. */
export const RUNNER_VERSION = '1.0.0';

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** Where the runner posts its result on the pull request. */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** `pull_request` activity types the generated workflow can listen to. */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** Why a downloaded result was rejected and the run stored as Failed. */
export const CiFailureReason = z.enum([
  'no_result',
  'result_expired',
  'result_too_large',
  'invalid_result',
  'secret_in_result',
  'commit_mismatch',
  'repository_mismatch',
  'run_mismatch',
]);
export type CiFailureReason = z.infer<typeof CiFailureReason>;

/**
 * One generated file in the CI bundle. Runner files are binary-ish and large, so
 * the preview sends `contents: null` for them and the size/hash only.
 */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string().nullable(),
  bytes: z.number().int().min(0),
  sha256: z.string(),
  editable: z.boolean().default(false),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio WRITES this shape to `.devdigest/agents/<slug>.yaml`; the
 * agent-runner READS it. Keeping one Zod schema for both ends guarantees the
 * formats never drift. `skills` are slugs resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  manifest_version: z.literal(MANIFEST_VERSION),
  agent_version: z.number().int().min(1),
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/ci/preview` (and `/zip`, via CiInstallInput). */
export const CiPreviewInput = z.object({
  repo_id: z.string().uuid(),
  triggers: z.array(CiTrigger).min(1),
  post_as: CiPostAs,
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

/** Whether the target repository already holds the `OPENROUTER_API_KEY` secret. */
export const CiSecretStatus = z.enum(['present', 'missing', 'unknown']);
export type CiSecretStatus = z.infer<typeof CiSecretStatus>;

/** Response of `POST /agents/:id/ci/preview`. */
export const CiPreview = z.object({
  files: z.array(CiFile),
  base_branch: z.string().nullable(),
  /** Another agent's active installation in the same repository, if any. */
  replaces: z.object({ agent_id: z.string(), agent_name: z.string() }).nullable(),
  secret_status: CiSecretStatus,
});
export type CiPreview = z.infer<typeof CiPreview>;

/** Request body for `POST /agents/:id/ci/install` and `/zip`. */
export const CiInstallInput = CiPreviewInput.extend({
  /** The (possibly edited) workflow file; every other file is regenerated server-side. */
  workflow: z.string().max(64 * 1024),
  confirm_replace: z.boolean().default(false),
});
export type CiInstallInput = z.infer<typeof CiInstallInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiInstallInputBody = z.input<typeof CiInstallInput>;

export const CiRunStatus = z.enum(['succeeded', 'no_findings', 'failed']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** How an installation reached the repository. */
export const CiMethod = z.enum(['pr', 'manual']);
export type CiMethod = z.infer<typeof CiMethod>;

/** A persisted CI installation (mirrors `ci_installations`) plus derived fields. */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  /** GitHub's numeric repository id; null until the first refresh after a token-less zip export. */
  repository_id: z.number().int().nullable(),
  target_type: CiTarget,
  method: CiMethod,
  agent_version: z.number().int().nullable(),
  runner_version: z.string().nullable(),
  pr_url: z.string().nullable(),
  installed_at: z.string(),
  triggers: z.array(CiTrigger),
  post_as: CiPostAs,
  /** True when the agent's current manifest differs from the exported one. */
  outdated: z.boolean(),
  last_run_status: CiRunStatus.nullable(),
  last_run_at: z.string().nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/ci/install`. */
export const CiInstallResult = z.object({
  installation: CiInstallation,
  pr_url: z.string().nullable(),
});
export type CiInstallResult = z.infer<typeof CiInstallResult>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  repo: z.string(),
  pr_number: z.number().int().nullable(),
  pr_title: z.string().nullable(),
  /** DevDigest pull request id when the PR is imported; null otherwise. */
  pr_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  source: z.string().nullable(),
  ran_at: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  critical: z.number().int().nullable(),
  warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(),
  verdict: Verdict.nullable(),
  cost_usd: z.number().nullable(),
  status: CiRunStatus,
  failure_reason: CiFailureReason.nullable(),
  job_url: z.string().nullable(),
  commit_sha: z.string().nullable(),
  manifest_version: z.number().int().nullable(),
  agent_version: z.number().int().nullable(),
  runner_version: z.string().nullable(),
  model: z.string().nullable(),
  /** GitHub Actions workflow run id. */
  run_id: z.number().int(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Response of `GET /agents/:id/ci`. */
export const CiAgentOverview = z.object({
  installations: z.array(CiInstallation),
  runs: z.array(CiRun),
});
export type CiAgentOverview = z.infer<typeof CiAgentOverview>;

/** Query of `GET /ci/runs`. */
export const CiRunsQuery = z.object({
  period: z.enum(['7d', '30d', 'all']).default('7d'),
  agent_id: z.string().uuid().optional(),
  repo: z.string().max(200).optional(),
  status: CiRunStatus.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;

/** Response of `GET /ci/runs` (keyset pagination). */
export const CiRunPage = z.object({
  runs: z.array(CiRun),
  next_cursor: z.string().nullable(),
});
export type CiRunPage = z.infer<typeof CiRunPage>;

/** Request body of `POST /ci/refresh`. */
export const CiRefreshInput = z.object({ force: z.boolean().default(false) });
export type CiRefreshInput = z.infer<typeof CiRefreshInput>;

/** Response of `POST /ci/refresh`; `github_error` is a fixed code, never a GitHub body. */
export const CiRefreshResult = z.object({
  refreshed: z.number().int().min(0),
  github_error: z.string().nullable(),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/** Bounds of the `devdigest-result.json` numbers: the int32 range of their DB columns. */
const CI_INT32 = z.number().int().min(0).max(2147483647);
/** Cap of every free string in the result (agent, model, runner version). */
const CI_TEXT_MAX = 200;

/**
 * The artifact the CI runner uploads (`devdigest-result.json`). Counts and ids
 * only — never PR text, diff or finding text. Validated by the runner before it
 * writes the file and by the server before it stores the run.
 */
export const CiResultArtifact = z.object({
  findings_count: CI_INT32,
  critical: CI_INT32,
  warning: CI_INT32,
  suggestion: CI_INT32,
  verdict: Verdict,
  cost_usd: z.number().finite().min(0).nullable(),
  duration_ms: CI_INT32,
  agent: z.string().max(CI_TEXT_MAX),
  manifest_version: CI_INT32,
  agent_version: CI_INT32,
  runner_version: z.string().max(CI_TEXT_MAX),
  model: z.string().max(CI_TEXT_MAX),
  commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
  repository_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  run_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  // Informational only: the server takes the PR number from GitHub's run, never from here.
  pr_number: z.number().int().positive().max(2147483647),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
