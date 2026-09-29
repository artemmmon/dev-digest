/**
 * Application service: what each tool does, without the MCP SDK. It is built from the
 * `DevDigestApi` port and the config, orchestrates resolve, refresh, start, wait and
 * shaping, and speaks in `domain.ts` types. Failures the caller can act on are thrown
 * as `NextStepError` (or `ApiError` from the port); the tool edge maps both to `isError`.
 */
import { ApiError } from './api/errors.js';
import type { DevDigestApi } from './api/port.js';
import type { RunInfo } from './api/schemas.js';
import type { McpConfig } from './config.js';
import type { ConventionsResult, ListAgentsResult, RunResult } from './domain.js';
import { NextStepError } from './errors.js';
import { buildRunResult, clip, toConvention } from './format.js';
import { log } from './log.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { POLL_MS, toRunStatus, waitForRun } from './wait.js';

/** Findings returned by `run_agent_on_pr`. */
export const MAX_FINDINGS = 15;
/** Agents returned by `list_agents`. */
export const MAX_AGENTS = 100;

export interface ServiceOptions {
  /** Aborted when the process is stopping; long waits end at once. */
  shutdown?: AbortSignal | undefined;
  /** Poll interval while a review runs (tests shorten it). */
  pollMs?: number | undefined;
  sleep?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
}

/** One poll of a running review, for the caller to report. */
export interface RunProgress {
  elapsedS: number;
  totalS: number;
}

export interface RunAgentInput {
  repo: string;
  pr: number;
  agent: string;
}

export interface GetFindingsInput extends RunAgentInput {
  runId?: string | undefined;
  limit: number;
  detail: 'concise' | 'detailed';
}

export interface GetConventionsInput {
  repo: string;
  status: 'accepted' | 'pending' | 'all';
  limit: number;
}

/** Runs of one agent on the PR, newest first (the API returns them that way). */
function pickRun(
  runs: RunInfo[],
  agentId: string,
  runId: string | undefined,
  label: string,
): { run: RunInfo; newerRunning: boolean } {
  const mine = runs.filter((r) => r.agent_id === agentId);
  if (runId) {
    const run = mine.find((r) => r.run_id === runId);
    if (!run) {
      throw new NextStepError(`Run ${runId} is not a run of ${label}; omit run_id to get the latest run.`);
    }
    return { run, newerRunning: false };
  }
  const latest = mine[0];
  if (!latest) {
    throw new NextStepError(`No review of ${label} yet; call run_agent_on_pr with the same repo, pr and agent.`);
  }
  const done = mine.find((r) => toRunStatus(r.status) === 'done');
  // Prefer the latest finished run; a newer one still running is mentioned in next_step.
  if (done && done !== latest && toRunStatus(latest.status) === 'running') {
    return { run: done, newerRunning: true };
  }
  return { run: latest, newerRunning: false };
}

export class DevDigestService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly config: McpConfig,
    private readonly options: ServiceOptions = {},
  ) {}

  async listAgents(input: { includeDisabled: boolean }, signal?: AbortSignal): Promise<ListAgentsResult> {
    const all = await this.api.listAgents(signal);
    const shown = all.filter((a) => input.includeDisabled || a.enabled);
    return {
      agents: shown.slice(0, MAX_AGENTS).map((a) => ({
        id: a.id,
        name: clip(a.name, 100),
        description: clip(a.description, 160),
        enabled: a.enabled,
        provider: clip(a.provider, 40),
        model: clip(a.model, 100),
      })),
      total: shown.length,
      next_step:
        all.length === 0
          ? 'No reviewer agents configured; create one on the DevDigest Agents page.'
          : shown.length === 0
            ? 'All agents are disabled; enable one on the DevDigest Agents page or pass include_disabled true.'
            : null,
    };
  }

  /**
   * Starts (or joins) one agent's review of a PR and waits for it up to the configured
   * maximum. A run still going at that point, or a client that went away, yields a
   * non-error `running` result; the server-side run is never cancelled from here.
   */
  async runAgentOnPr(
    input: RunAgentInput,
    opts: { signal?: AbortSignal | undefined; onProgress?: ((p: RunProgress) => void | Promise<void>) | undefined } = {},
  ): Promise<RunResult> {
    const { api } = this;
    const maxWaitS = this.config.maxWaitS;
    const signals = [opts.signal, this.options.shutdown].filter((s): s is AbortSignal => s !== undefined);
    const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

    const found = await resolveRepo(api, input.repo, signal);
    const pull = await resolvePull(api, found, input.pr, { syncOnMiss: true, signal });
    const ag = await resolveAgent(api, input.agent, signal);

    // Without this a never-opened PR is reviewed as an empty diff (server/INSIGHTS.md).
    try {
      await api.refreshPull(pull.id, signal);
    } catch (err) {
      // The API already falls back to the persisted PR when GitHub is unavailable;
      // an unreachable or rate-limited API is still fatal.
      if (!(err instanceof ApiError) || err.kind !== 'server') throw err;
      log.warn('PR refresh failed on the API side; continuing with the persisted PR');
    }

    // Same agent already running on this PR: wait for it instead of paying twice.
    const active = (await api.activeRuns(pull.id, signal)).find((r) => r.agent_id === ag.id);
    const runId = active ? active.run_id : (await api.startReview(pull.id, ag.id, signal)).runId;

    const { onProgress } = opts;
    const waited = await waitForRun({
      api,
      prId: pull.id,
      runId,
      maxWaitMs: maxWaitS * 1000,
      pollMs: this.options.pollMs ?? POLL_MS,
      signal,
      onProgress: onProgress
        ? (elapsedMs) => onProgress({ elapsedS: Math.round(elapsedMs / 1000), totalS: maxWaitS })
        : undefined,
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
      ...(this.options.now ? { now: this.options.now } : {}),
    });

    const base = { runId, repo: found.full_name, pr: pull.number, agent: ag, limit: MAX_FINDINGS, detail: 'concise' as const };

    if (waited.state === 'failed') {
      throw new NextStepError(
        `Review run ${runId} failed: ${clip(waited.run?.error ?? 'no error message', 200)}. ` +
          "Check the agent's provider key in DevDigest Settings, then call run_agent_on_pr again.",
      );
    }
    if (waited.state === 'cancelled') {
      return buildRunResult({
        ...base,
        status: 'cancelled',
        nextStep: `Run ${runId} was cancelled in DevDigest; call run_agent_on_pr again to rerun.`,
      });
    }
    if (waited.state === 'timeout' || waited.state === 'aborted') {
      return buildRunResult({
        ...base,
        status: 'running',
        nextStep: `Still running after ${maxWaitS}s; call get_findings with the same repo, pr and agent in about a minute.`,
      });
    }
    return buildRunResult({
      ...base,
      status: 'done',
      review: waited.review,
      nextStep: waited.review
        ? null
        : `Run ${runId} finished but its review is not stored yet; call get_findings with the same repo, pr and agent.`,
    });
  }

  /** Read-only: the stored result of one agent's run (latest finished, or `runId`). */
  async getFindings(input: GetFindingsInput, signal?: AbortSignal): Promise<RunResult> {
    const { api } = this;
    const found = await resolveRepo(api, input.repo, signal);
    const pull = await resolvePull(api, found, input.pr, { syncOnMiss: false, signal });
    const ag = await resolveAgent(api, input.agent, signal);
    const label = `PR #${pull.number} by ${clip(ag.name, 100)}`;

    const runs = await api.listRuns(pull.id, signal);
    const { run, newerRunning } = pickRun(runs, ag.id, input.runId, label);
    const status = toRunStatus(run.status);

    let review;
    if (status === 'done') {
      review = (await api.reviews(pull.id, signal)).find((r) => r.run_id === run.run_id);
    }

    let nextStep: string | null = null;
    if (status === 'running') {
      nextStep = 'Run is still in progress; call get_findings again in about a minute.';
    } else if (status === 'failed') {
      nextStep =
        `Review run ${run.run_id} failed: ${clip(run.error ?? 'no error message', 200)}. ` +
        "Check the agent's provider key in DevDigest Settings, then call run_agent_on_pr again.";
    } else if (status === 'cancelled') {
      nextStep = `Run ${run.run_id} was cancelled in DevDigest; call run_agent_on_pr to run it again.`;
    } else if (!review) {
      nextStep = `Run ${run.run_id} has no stored review; call run_agent_on_pr to run it again.`;
    } else if (newerRunning) {
      nextStep = 'A newer run is still in progress; call get_findings again in about a minute for its result.';
    }

    return buildRunResult({
      status,
      runId: run.run_id,
      repo: found.full_name,
      pr: pull.number,
      agent: ag,
      review,
      limit: input.limit,
      detail: input.detail,
      nextStep,
    });
  }

  async getConventions(input: GetConventionsInput, signal?: AbortSignal): Promise<ConventionsResult> {
    const found = await resolveRepo(this.api, input.repo, signal);
    const list = await this.api.conventions(found.id, signal);
    const live = list.candidates.filter((c) => c.status !== 'rejected');
    const pending = live.filter((c) => c.status === 'pending').length;
    const wanted = live.filter((c) => input.status === 'all' || c.status === input.status);

    let nextStep: string | null = null;
    if (list.last_scan === null && live.length === 0) {
      nextStep = `No convention scan yet for ${found.full_name}; run one on its Conventions page in DevDigest.`;
    } else if (wanted.length === 0 && input.status === 'accepted' && pending > 0) {
      nextStep = `${pending} pending conventions await triage; call get_conventions with status 'pending'.`;
    }

    return {
      repo: found.full_name,
      last_scan_at: list.last_scan?.at ?? null,
      conventions: wanted.slice(0, input.limit).map(toConvention),
      total: wanted.length,
      truncated: wanted.length > input.limit,
      next_step: nextStep,
    };
  }
}
