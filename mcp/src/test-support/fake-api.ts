/** In-memory DevDigestApi for tests: scripted state, a call log, per-method failures. */
import type { DevDigestApi, PullRef } from '../api/port.js';
import type {
  ActiveRunInfo,
  AgentInfo,
  BlastInfo,
  ConventionListInfo,
  FindingInfo,
  ReviewInfo,
  RunInfo,
  RepoInfo,
} from '../api/schemas.js';
import type { ApiError } from '../api/errors.js';

export const REPO_ID = '00000000-0000-4000-8000-000000000001';
export const PR_ID = '00000000-0000-4000-8000-000000000002';
export const AGENT_ID = '00000000-0000-4000-8000-000000000003';
export const AGENT2_ID = '00000000-0000-4000-8000-000000000004';
export const RUN_ID = '00000000-0000-4000-8000-000000000005';

export function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: AGENT_ID,
    name: 'Security Reviewer',
    description: 'Finds security bugs.',
    enabled: true,
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    ...over,
  };
}

export function finding(over: Partial<FindingInfo> = {}): FindingInfo {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Unchecked input',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'The value is used without validation.',
    suggestion: 'Validate with zod.',
    scope: null,
    dismissed_at: null,
    ...over,
  };
}

export function review(over: Partial<ReviewInfo> = {}): ReviewInfo {
  return {
    id: 'rev-1',
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    verdict: 'request_changes',
    summary: 'Two issues found.',
    score: 62,
    created_at: '2026-09-29T10:00:00Z',
    findings: [finding()],
    ...over,
  };
}

export function run(over: Partial<RunInfo> = {}): RunInfo {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    agent_name: 'Security Reviewer',
    status: 'done',
    error: null,
    score: 62,
    ran_at: '2026-09-29T10:00:00Z',
    ...over,
  };
}

export function blastInfo(over: Partial<BlastInfo> = {}): BlastInfo {
  return {
    blast: {
      changed_symbols: [{ name: 'getContext', file: 'src/context.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'getContext',
          callers: [
            { name: 'listRepos', file: 'src/routes.ts', line: 12 },
            { name: 'runReview', file: 'src/service.ts', line: 40 },
          ],
          endpoints_affected: ['GET /repos'],
          crons_affected: [],
        },
      ],
      summary: 'Changes 1 symbol used by 2 callers.',
    },
    head_sha: 'abc1234',
    index: { degraded: false, reason: null },
    counts: { changed_files: 1, symbols: 1, callers: 2, endpoints: 1, crons: 0 },
    truncated: false,
    ...over,
  };
}

export type ApiMethod = keyof DevDigestApi;

export class FakeApi implements DevDigestApi {
  repos: RepoInfo[] = [{ id: REPO_ID, full_name: 'acme/api' }];
  agents: AgentInfo[] = [agent()];
  /** PRs persisted in the DB. */
  pulls: PullRef[] = [{ id: PR_ID, number: 7, title: 'Add rate limiting' }];
  /** PRs that appear in `pulls` after `syncPulls`. */
  remotePulls: PullRef[] = [];
  active: ActiveRunInfo[] = [];
  /** Answer of the n-th `listRuns` call (the last entry repeats). */
  runsSequence: RunInfo[][] = [[run()]];
  reviewsList: ReviewInfo[] = [review()];
  conventionList: ConventionListInfo = { candidates: [], last_scan: null };
  blastResponse: BlastInfo = blastInfo();
  startedRunId = RUN_ID;

  readonly calls: string[] = [];
  /** Throws this on the named method. */
  readonly failures = new Map<ApiMethod, Error | ApiError>();
  private listRunsCalls = 0;

  private hit(method: ApiMethod, arg?: string): void {
    this.calls.push(arg === undefined ? method : `${method}:${arg}`);
    const failure = this.failures.get(method);
    if (failure) throw failure;
  }

  count(method: ApiMethod): number {
    return this.calls.filter((c) => c === method || c.startsWith(`${method}:`)).length;
  }

  async listRepos() {
    this.hit('listRepos');
    return this.repos;
  }
  async listAgents() {
    this.hit('listAgents');
    return this.agents;
  }
  async pullByNumber(_repoId: string, number: number) {
    this.hit('pullByNumber', String(number));
    return this.pulls.find((p) => p.number === number) ?? null;
  }
  async syncPulls() {
    this.hit('syncPulls');
    for (const p of this.remotePulls) {
      if (!this.pulls.some((x) => x.number === p.number)) this.pulls.push(p);
    }
    return this.pulls;
  }
  async refreshPull() {
    this.hit('refreshPull');
  }
  async activeRuns() {
    this.hit('activeRuns');
    return this.active;
  }
  async startReview(_prId: string, agentId: string) {
    this.hit('startReview', agentId);
    return { runId: this.startedRunId };
  }
  async listRuns() {
    this.hit('listRuns');
    const i = Math.min(this.listRunsCalls++, this.runsSequence.length - 1);
    return this.runsSequence[i] ?? [];
  }
  async reviews() {
    this.hit('reviews');
    return this.reviewsList;
  }
  async conventions() {
    this.hit('conventions');
    return this.conventionList;
  }
  async blast() {
    this.hit('blast');
    return this.blastResponse;
  }
}
