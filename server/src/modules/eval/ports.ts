import type {
  EvalCaseMeta,
  EvalCaseRecord,
  EvalCaseResult,
  EvalExpectation,
  EvalRunStatus,
  EvalRunSummary,
  EvalSkillVersion,
  EvalTrendPoint,
  LLMProvider,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';

/**
 * Ports of the eval module (onion-architecture: core declares, outer ring implements).
 * Narrow structural types only: no other module's types are imported, so the container can
 * pass `agentsRepo` / `reviewRepo` as they are.
 */

/** A case as the store writes it. */
export interface NewEvalCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation;
  sourceFindingId: string | null;
}

/** What a run claim stores: the version snapshot and the ids of the cases captured at start. */
export interface ClaimRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  skillVersions: EvalSkillVersion[];
  caseIds: string[];
}

/** The run-level numbers written when a run finishes. */
export interface RunMetrics {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  unlabelledFindings: number;
  costUsd: number | null;
}

/** A result row of a run, with the run it belongs to. */
export interface RunCaseResult {
  runId: string;
  result: EvalCaseResult;
}

/** The editable fields of a stored case; its id, agent and source finding never change (AC-54). */
export interface EvalCaseChanges {
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation;
}

/** Why a guarded delete stored nothing: a run of the agent is running, or the case is gone. */
export type DeleteCaseResult = 'deleted' | 'running' | 'not_found';

/** Why a bounded insert stored nothing. */
export type InsertCaseFailure = 'duplicate' | 'limit' | 'no_agent';

/**
 * Workspace-scoped persistence of eval cases, runs and per-case results. Every method that
 * takes a `workspaceId` filters by it; ids of runs or cases come from an already scoped read.
 */
export interface EvalStore {
  /** The agent's cases, oldest first, each with its latest COUNTED outcome (AC-16, AC-66). */
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]>;
  /**
   * Insert a case unless the agent already holds `limit` cases or a case of the same source
   * finding exists (a unique violation). Count and insert are one unit under the agent row lock,
   * so two concurrent saves cannot pass the limit.
   */
  insertCase(values: NewEvalCase, limit: number): Promise<EvalCaseRecord | InsertCaseFailure>;
  /** One case of the workspace, with its latest counted outcome; undefined when absent or foreign. */
  getCase(workspaceId: string, caseId: string): Promise<EvalCaseRecord | undefined>;
  /** Overwrite the editable fields in place (same id, same source finding); undefined when absent. */
  updateCase(
    workspaceId: string,
    caseId: string,
    changes: EvalCaseChanges,
  ): Promise<EvalCaseRecord | undefined>;
  /**
   * Delete a case in one statement that refuses while a run of its agent is `running`
   * (no check-then-act). Results cascade; stored run metrics stay (AC-56, AC-57).
   */
  deleteCaseIfIdle(workspaceId: string, caseId: string): Promise<DeleteCaseResult>;
  /**
   * Atomically start a run (`status='running'`, counters 0, `cases_total` = case ids). Null when
   * a run of the agent is already running (unique violation of the one-running index).
   */
  claimRun(values: ClaimRun): Promise<EvalRunSummary | null>;
  /**
   * Store one case result and advance the run's counters, in one transaction guarded by
   * `status='running'`. False (and nothing stored) when the run was already ended or reaped.
   */
  recordCaseResult(runId: string, result: EvalCaseResult): Promise<boolean>;
  /** End a run with its status and metrics, only while it is `running`. False when it is not. */
  finishRun(runId: string, status: Exclude<EvalRunStatus, 'running'>, metrics: RunMetrics): Promise<boolean>;
  /** Newest first. */
  listRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalRunSummary[]>;
  /** The newest `done`/`partial` runs of an agent, newest first (AC-66). */
  latestCounted(workspaceId: string, agentId: string, n: number): Promise<EvalRunSummary[]>;
  /** Runs by id inside the workspace; an unknown or foreign id is absent. */
  getRuns(workspaceId: string, runIds: string[]): Promise<EvalRunSummary[]>;
  /** run id → the case ids captured when the run started (`eval_runs.case_ids`). */
  caseIdsOfRuns(runIds: string[]): Promise<Map<string, string[]>>;
  /** Stored case results of the given runs. */
  caseResults(runIds: string[]): Promise<RunCaseResult[]>;
  /** id → name of the cases in the workspace. */
  caseNames(workspaceId: string, caseIds: string[]): Promise<Map<string, string>>;
  /** agent id → its latest counted run, for every agent of the workspace that has one. */
  latestCountedByAgent(workspaceId: string): Promise<Map<string, EvalRunSummary>>;
  /** The `n` newest counted runs across the workspace, newest first. */
  recentCounted(workspaceId: string, n: number): Promise<EvalRunSummary[]>;
  /** Every counted run of an agent as a trend point, oldest first (AC-58, AC-66). */
  trend(workspaceId: string, agentId: string): Promise<EvalTrendPoint[]>;
  /** Every `running` run becomes `failed`; returns how many. */
  reapRunning(): Promise<number>;
  /** finding id → case id for the findings that have a case (workspace-scoped, one query). */
  caseIdsBySourceFinding(workspaceId: string, findingIds: string[]): Promise<Map<string, string>>;
}

/** An agent as an eval run needs it. */
export interface EvalAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  version: number;
}

/** A skill that reaches the prompt, with its current version. */
export interface EvalSkill {
  id: string;
  name: string;
  body: string;
  appliesTo: string[] | null;
  version: number;
}

/** What the eval module reads from the agents module (satisfied by `AgentsRepository`). */
export interface EvalAgentSource {
  getById(workspaceId: string, id: string): Promise<EvalAgent | undefined>;
  /** Every agent of the workspace, enabled or not. */
  list(workspaceId: string): Promise<Array<{ id: string; name: string }>>;
  /** The immutable config snapshot of one version (`system_prompt`, `model`, …). */
  getVersion(agentId: string, version: number): Promise<{ configJson: unknown } | undefined>;
  /** Skills that reach the prompt, in binding order (binding AND skill enabled). */
  resolvedSkills(agentId: string): Promise<EvalSkill[]>;
}

/** What the eval module reads from the reviews module (satisfied by `ReviewRepository`). */
export interface EvalFindingSource {
  findingContext(findingId: string): Promise<
    | {
        finding: { id: string; file: string; startLine: number; endLine: number };
        review: { agentId: string | null };
        pull: { workspaceId: string };
      }
    | undefined
  >;
}

export interface EvalLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Everything the service collaborates with: narrow ports, functions for cross-module reads. */
export interface EvalDeps {
  store: EvalStore;
  agents: EvalAgentSource;
  findings: EvalFindingSource;
  /** Lazy LLM client by provider id; throws a `config_error` AppError when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  logger?: EvalLogger;
  now?: () => number;
}

/** One case as captured at run start (AC-19): what the run replays, frozen. */
export interface CapturedCase {
  id: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  expectedOutput: EvalExpectation;
}

/** Everything the executor needs, read ONCE at start; an agent edit mid-run changes nothing (EC-6). */
export interface RunCapture {
  runId: string;
  agent: Pick<EvalAgent, 'id' | 'name' | 'model' | 'systemPrompt' | 'strategy' | 'version'>;
  /** The agent's resolved skills in binding order; each case filters them by its own files. */
  skills: EvalSkill[];
  cases: CapturedCase[];
  llm: LLMProvider;
}
