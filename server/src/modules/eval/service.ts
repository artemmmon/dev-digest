import type {
  EvalCaseRecord,
  EvalCaseSave,
  EvalCompare,
  EvalCompareSide,
  EvalDashboardOverview,
  EvalRunStarted,
  EvalRunsOverview,
  EvalRunSummary,
  EvalTrend,
  Provider,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { appliedSkills, checkCaseSave, prepareCaseDiff } from './case-rules.js';
import {
  CASE_DELETE_RUNNING_MESSAGE,
  CASE_EXISTS_MESSAGE,
  CASE_LIMIT_MESSAGE,
  COUNTED_STATUSES,
  DASHBOARD_RECENT_RUNS,
  DIFFERENT_AGENTS_MESSAGE,
  ERR,
  FINDING_AGENT_MISMATCH_MESSAGE,
  MAX_CASES_PER_AGENT,
  MISSING_KEY_MESSAGE_TEMPLATE,
  NOT_COUNTED_MESSAGE,
  NO_CASES_MESSAGE,
  PROVIDER_DISPLAY_NAMES,
  RUN_IN_PROGRESS_MESSAGE,
  RUN_LIST_DEFAULT_LIMIT,
  RUN_LIST_MAX_LIMIT,
  SAME_RUN_MESSAGE,
} from './constants.js';
import type { EvalAgent, EvalDeps, RunCapture } from './ports.js';
import { EvalRunExecutor } from './run-executor.js';

/**
 * Eval pipeline use cases: cases from findings or by hand, a background run per agent,
 * run history, compare and the dashboard. Scoring is code (`scoring.ts`); the only model
 * calls are the review engine's, made by `EvalRunExecutor`. Every read and write is
 * workspace-scoped; a foreign case, run or agent answers 404.
 */
export class EvalService {
  private executor: EvalRunExecutor;

  constructor(private deps: EvalDeps) {
    this.executor = new EvalRunExecutor({
      store: deps.store,
      ...(deps.logger ? { logger: deps.logger } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    });
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<EvalAgent> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  async listCases(workspaceId: string, agentId: string): Promise<{ cases: EvalCaseRecord[] }> {
    await this.requireAgent(workspaceId, agentId);
    return { cases: await this.deps.store.listCases(workspaceId, agentId) };
  }

  /**
   * Save a case. A seeded save (with `source_finding_id`) checks that the finding is in the
   * workspace and was produced by this agent, then stores the POSTED diff and meta.
   */
  async createCase(
    workspaceId: string,
    agentId: string,
    body: EvalCaseSave,
  ): Promise<EvalCaseRecord> {
    await this.requireAgent(workspaceId, agentId);

    if (body.source_finding_id) {
      const ctx = await this.deps.findings.findingContext(body.source_finding_id);
      if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
      if (ctx.review.agentId !== agentId) {
        throw new AppError(ERR.findingAgentMismatch, FINDING_AGENT_MISMATCH_MESSAGE, 422);
      }
    }

    const violation = checkCaseSave(body);
    if (violation) {
      throw new ValidationError(violation.message, [
        { path: violation.path, message: violation.message },
      ]);
    }

    const stored = await this.deps.store.insertCase(
      {
        workspaceId,
        agentId,
        name: body.name,
        inputDiff: body.input_diff,
        inputMeta: body.input_meta,
        expectedOutput: body.expected_output,
        sourceFindingId: body.source_finding_id ?? null,
      },
      MAX_CASES_PER_AGENT,
    );
    if (stored === 'limit') throw new AppError(ERR.caseLimit, CASE_LIMIT_MESSAGE, 422);
    if (stored === 'duplicate') throw new AppError(ERR.caseExists, CASE_EXISTS_MESSAGE, 409);
    if (stored === 'no_agent') throw new NotFoundError('Agent not found');
    return stored;
  }

  /**
   * Save an edited case under the same id and source finding (AC-54): the same rules as a
   * create (AC-11, AC-63, AC-64) run again on the posted values. `source_finding_id` of the
   * body is ignored; a case never changes finding.
   */
  async updateCase(
    workspaceId: string,
    caseId: string,
    body: EvalCaseSave,
  ): Promise<EvalCaseRecord> {
    const existing = await this.deps.store.getCase(workspaceId, caseId);
    if (!existing) throw new NotFoundError('Eval case not found');

    const violation = checkCaseSave(body);
    if (violation) {
      throw new ValidationError(violation.message, [
        { path: violation.path, message: violation.message },
      ]);
    }

    const updated = await this.deps.store.updateCase(workspaceId, caseId, {
      name: body.name,
      inputDiff: body.input_diff,
      inputMeta: body.input_meta,
      expectedOutput: body.expected_output,
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  }

  /**
   * Delete a case. 409 while a run of its agent is running (AC-57); past runs keep their
   * metrics (AC-56). The guard is one DELETE statement in the store, not a check here.
   */
  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    const result = await this.deps.store.deleteCaseIfIdle(workspaceId, caseId);
    if (result === 'not_found') throw new NotFoundError('Eval case not found');
    if (result === 'running') {
      throw new AppError(ERR.runInProgress, CASE_DELETE_RUNNING_MESSAGE, 409);
    }
  }

  /**
   * Claim a run and start it in the background; answers before any case completes (AC-18).
   * Order: agent (404) → at least one case (422) → provider key (422, before any insert) →
   * capture → claim (409) → run.
   */
  async startRun(workspaceId: string, agentId: string): Promise<EvalRunStarted> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.deps.store.listCases(workspaceId, agentId);
    if (cases.length === 0) throw new AppError(ERR.noCases, NO_CASES_MESSAGE, 422);

    const llm = await this.resolveLlm(agent.provider);

    // Capture once: what the run replays is frozen here (AC-19, EC-6, EC-8).
    const skills = await this.deps.agents.resolvedSkills(agent.id);
    const appliedIds = new Set<string>();
    for (const c of cases) {
      const { paths } = prepareCaseDiff(c.input_diff);
      for (const s of appliedSkills(skills, paths)) appliedIds.add(s.id);
    }
    const skillVersions = skills
      .filter((s) => appliedIds.has(s.id))
      .map((s) => ({ skill_id: s.id, name: s.name, version: s.version }));

    const run = await this.deps.store.claimRun({
      workspaceId,
      agentId: agent.id,
      agentVersion: agent.version,
      skillVersions,
      caseIds: cases.map((c) => c.id),
    });
    if (!run) throw new AppError(ERR.runInProgress, RUN_IN_PROGRESS_MESSAGE, 409);

    const capture: RunCapture = {
      runId: run.id,
      agent: {
        id: agent.id,
        name: agent.name,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        version: agent.version,
      },
      skills,
      cases: cases.map((c) => ({
        id: c.id,
        name: c.name,
        inputDiff: c.input_diff,
        inputMeta: c.input_meta,
        expectedOutput: c.expected_output,
      })),
      llm,
    };
    // fire-and-forget: the executor records its own outcome; this catch covers a store failure
    void this.executor.run(capture).catch((err: unknown) => {
      this.deps.logger?.warn(
        { runId: run.id, outcome: 'store_error', error: err instanceof Error ? err.name : 'unknown' },
        'eval run outcome could not be stored',
      );
    });
    return { run_id: run.id, status: 'running' };
  }

  private async resolveLlm(provider: Provider) {
    try {
      return await this.deps.llm(provider);
    } catch (err) {
      if (err instanceof AppError && err.code === 'config_error') {
        throw new AppError(
          ERR.providerNotConfigured,
          MISSING_KEY_MESSAGE_TEMPLATE.replace('{provider}', PROVIDER_DISPLAY_NAMES[provider]),
          422,
          { provider },
        );
      }
      throw err;
    }
  }

  async listRuns(
    workspaceId: string,
    agentId: string,
    limit: number = RUN_LIST_DEFAULT_LIMIT,
  ): Promise<EvalRunsOverview> {
    await this.requireAgent(workspaceId, agentId);
    const bounded = Math.min(Math.max(1, Math.trunc(limit)), RUN_LIST_MAX_LIMIT);
    // The counted pair is read separately so a list full of failed runs still finds it (AC-66).
    const [runs, counted] = await Promise.all([
      this.deps.store.listRuns(workspaceId, agentId, bounded),
      this.deps.store.latestCounted(workspaceId, agentId, 2),
    ]);
    return {
      runs,
      latest_counted: counted[0] ?? null,
      previous_counted: counted[1] ?? null,
    };
  }

  /** Two counted runs of one agent, oldest first, with prompts, flipped cases and set sizes. */
  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalCompare> {
    if (aId === bId) throw new ValidationError(SAME_RUN_MESSAGE);
    const found = await this.deps.store.getRuns(workspaceId, [aId, bId]);
    const a = found.find((r) => r.id === aId);
    const b = found.find((r) => r.id === bId);
    if (!a || !b) throw new NotFoundError('Run not found');
    if (a.agent_id !== b.agent_id) {
      throw new AppError(ERR.differentAgents, DIFFERENT_AGENTS_MESSAGE, 422);
    }
    if (!COUNTED_STATUSES.includes(a.status) || !COUNTED_STATUSES.includes(b.status)) {
      throw new AppError(ERR.notCounted, NOT_COUNTED_MESSAGE, 422);
    }
    const [older, newer] = orderByStart(a, b);

    const [results, caseIdsByRun, olderSide, newerSide] = await Promise.all([
      this.deps.store.caseResults([older.id, newer.id]),
      this.deps.store.caseIdsOfRuns([older.id, newer.id]),
      this.side(older),
      this.side(newer),
    ]);

    const statusOf = (runId: string) =>
      new Map(results.filter((r) => r.runId === runId).map((r) => [r.result.case_id, r.result.status]));
    const olderStatus = statusOf(older.id);
    const newerStatus = statusOf(newer.id);
    const flippedIds: string[] = [];
    const direction = new Map<string, { from: 'pass' | 'fail'; to: 'pass' | 'fail' }>();
    for (const [caseId, from] of olderStatus) {
      const to = newerStatus.get(caseId);
      if (from === 'error' || to === undefined || to === 'error' || to === from) continue;
      flippedIds.push(caseId);
      direction.set(caseId, { from, to });
    }
    const names = await this.deps.store.caseNames(workspaceId, flippedIds);
    const flipped = flippedIds
      .filter((id) => names.has(id))
      .map((id) => ({ case_id: id, name: names.get(id)!, ...direction.get(id)! }))
      .sort((x, y) => x.name.localeCompare(y.name) || x.case_id.localeCompare(y.case_id));

    const olderIds = new Set(caseIdsByRun.get(older.id) ?? []);
    const newerIds = new Set(caseIdsByRun.get(newer.id) ?? []);
    const onlyInOlder = [...olderIds].filter((id) => !newerIds.has(id)).length;
    const onlyInNewer = [...newerIds].filter((id) => !olderIds.has(id)).length;

    return {
      older: olderSide,
      newer: newerSide,
      flipped,
      case_sets_differ: onlyInOlder > 0 || onlyInNewer > 0,
      only_in_older: onlyInOlder,
      only_in_newer: onlyInNewer,
    };
  }

  /** The run with the prompt and model its agent version held (null when the snapshot is gone). */
  private async side(run: EvalRunSummary): Promise<EvalCompareSide> {
    const version = await this.deps.agents.getVersion(run.agent_id, run.agent_version);
    const cfg = version?.configJson;
    const record = cfg !== null && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {};
    return {
      run,
      system_prompt: typeof record.system_prompt === 'string' ? record.system_prompt : null,
      model: typeof record.model === 'string' ? record.model : null,
    };
  }

  /** Every agent with its latest counted run, and the newest counted runs of the workspace. */
  async dashboard(workspaceId: string): Promise<EvalDashboardOverview> {
    const [agents, latest, recent] = await Promise.all([
      this.deps.agents.list(workspaceId),
      this.deps.store.latestCountedByAgent(workspaceId),
      this.deps.store.recentCounted(workspaceId, DASHBOARD_RECENT_RUNS),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    return {
      agents: agents.map((a) => ({ agent_id: a.id, name: a.name, latest: latest.get(a.id) ?? null })),
      recent_runs: recent.map((r) => ({ ...r, agent_name: names.get(r.agent_id) ?? '' })),
    };
  }

  /** Every counted run of the agent, oldest first: the points of the trend chart (AC-58). */
  async trend(workspaceId: string, agentId: string): Promise<EvalTrend> {
    await this.requireAgent(workspaceId, agentId);
    return { points: await this.deps.store.trend(workspaceId, agentId) };
  }

  /** Marks every run a dead process left `running` as failed. Call once on boot. */
  reapInterrupted(): Promise<number> {
    return this.deps.store.reapRunning();
  }
}

/** Oldest first by start time; the id breaks a tie so the order is stable. */
function orderByStart(a: EvalRunSummary, b: EvalRunSummary): [EvalRunSummary, EvalRunSummary] {
  const byTime = a.started_at.localeCompare(b.started_at);
  const first = byTime !== 0 ? byTime < 0 : a.id.localeCompare(b.id) < 0;
  return first ? [a, b] : [b, a];
}
