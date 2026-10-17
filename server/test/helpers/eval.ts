import type {
  EvalCaseRecord,
  EvalCaseResult,
  EvalExpectation,
  EvalRunStatus,
  EvalRunSummary,
  EvalTrendPoint,
  Finding,
  LLMProvider,
  Provider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import type {
  ClaimRun,
  DeleteCaseResult,
  EvalAgent,
  EvalAgentSource,
  EvalCaseChanges,
  EvalFindingSource,
  EvalSkill,
  EvalStore,
  InsertCaseFailure,
  NewEvalCase,
  RunCaseResult,
  RunMetrics,
} from '../../src/modules/eval/ports.js';

/**
 * In-memory fakes of the eval module's ports, shared by the eval unit tests: a store that
 * enforces the rules the Postgres one does (one running run per agent, case limit, one case
 * per source finding, results written only while the run is running), a canned model, and
 * agent / finding sources. No database, no network, no key.
 */

export const WS = 'ws-1';
export const AGENT_ID = 'agent-1';

/** A one-hunk diff of `file` whose new side is lines 10-13 (`--- a/` + `+++ b/` headers, no `diff --git`). */
export function diffFor(file: string): string {
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -10,3 +10,4 @@',
    ' context a',
    '+added line',
    ' context b',
    ' context c',
    '',
  ].join('\n');
}

export function expectation(
  type: EvalExpectation['type'],
  file: string,
  start_line = 10,
  end_line = 12,
): EvalExpectation {
  return { type, file, start_line, end_line };
}

/** A grounded-looking finding (valid against the engine's `Finding` schema). */
export function finding(id: string, file: string, start: number, end = start): Finding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `Problem at ${file}:${start}`,
    file,
    start_line: start,
    end_line: end,
    rationale: 'canned',
    confidence: 0.9,
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

interface CaseRow {
  workspaceId: string;
  agentId: string;
  record: EvalCaseRecord;
}

interface RunRow {
  workspaceId: string;
  summary: EvalRunSummary;
  caseIds: string[];
}

const COUNTED: EvalRunStatus[] = ['done', 'partial'];

export interface MemoryEvalStore extends EvalStore {
  readonly cases: CaseRow[];
  readonly runs: RunRow[];
  readonly results: RunCaseResult[];
  readonly claims: ClaimRun[];
  /** Resolves with the final status once `finishRun` (or a refused write) ends `runId`. */
  ended(runId: string): Promise<string>;
  /** Test seam: add a case without the service. */
  seedCase(values: {
    id?: string;
    agentId?: string;
    workspaceId?: string;
    name?: string;
    inputDiff: string;
    expected: EvalExpectation;
    sourceFindingId?: string | null;
    prTitle?: string;
    prBody?: string;
  }): EvalCaseRecord;
  /** Test seam: add a finished (or running) run with given metrics. */
  seedRun(values: {
    id?: string;
    agentId?: string;
    workspaceId?: string;
    status: EvalRunStatus;
    startedAt: string;
    agentVersion?: number;
    caseIds?: string[];
    metrics?: Partial<EvalRunSummary>;
    results?: EvalCaseResult[];
  }): EvalRunSummary;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function createMemoryEvalStore(): MemoryEvalStore {
  const cases: CaseRow[] = [];
  const runs: RunRow[] = [];
  const results: RunCaseResult[] = [];
  const claims: ClaimRun[] = [];
  const waiters = new Map<string, Array<(status: string) => void>>();
  const finalStatus = new Map<string, string>();

  const settle = (runId: string, status: string) => {
    finalStatus.set(runId, status);
    for (const w of waiters.get(runId) ?? []) w(status);
    waiters.delete(runId);
  };

  const countedRuns = (ws: string, agentId?: string) =>
    runs
      .filter(
        (r) =>
          r.workspaceId === ws &&
          COUNTED.includes(r.summary.status) &&
          (agentId === undefined || r.summary.agent_id === agentId),
      )
      .sort(
        (a, b) =>
          b.summary.started_at.localeCompare(a.summary.started_at) ||
          b.summary.id.localeCompare(a.summary.id),
      );

  const withLatest = (row: CaseRow): EvalCaseRecord => {
    const counted = countedRuns(row.workspaceId, row.agentId);
    for (const run of counted) {
      const hit = results.find((r) => r.runId === run.summary.id && r.result.case_id === row.record.id);
      if (hit) {
        return {
          ...row.record,
          latest: {
            status: hit.result.status,
            expected_count: row.record.latest.expected_count,
            matched_count: hit.result.status === 'error' ? null : hit.result.matched_count,
          },
        };
      }
    }
    return { ...row.record, latest: { ...row.record.latest, status: 'never_run', matched_count: null } };
  };

  const hasRunning = (agentId: string) =>
    runs.some((r) => r.summary.agent_id === agentId && r.summary.status === 'running');

  const expectedCount = (e: EvalExpectation) => (e.type === 'must_find' ? 1 : 0);

  const store: MemoryEvalStore = {
    cases,
    runs,
    results,
    claims,

    ended(runId) {
      const done = finalStatus.get(runId);
      if (done !== undefined) return Promise.resolve(done);
      return new Promise((resolve) => {
        waiters.set(runId, [...(waiters.get(runId) ?? []), resolve]);
      });
    },

    seedCase(v) {
      const id = v.id ?? nextId('case');
      const record: EvalCaseRecord = {
        id,
        owner_kind: 'agent',
        owner_id: v.agentId ?? AGENT_ID,
        name: v.name ?? `case ${id}`,
        input_diff: v.inputDiff,
        input_meta: { pr_title: v.prTitle ?? `Change ${id}`, pr_body: v.prBody ?? '' },
        expected_output: v.expected,
        source_finding_id: v.sourceFindingId ?? null,
        notes: null,
        created_at: new Date(2026, 9, 1, 0, 0, cases.length).toISOString(),
        latest: { status: 'never_run', expected_count: expectedCount(v.expected), matched_count: null },
      };
      cases.push({ workspaceId: v.workspaceId ?? WS, agentId: v.agentId ?? AGENT_ID, record });
      return record;
    },

    seedRun(v) {
      const id = v.id ?? nextId('run');
      const caseIds = v.caseIds ?? [];
      const summary: EvalRunSummary = {
        id,
        agent_id: v.agentId ?? AGENT_ID,
        agent_version: v.agentVersion ?? 1,
        skill_versions: [],
        status: v.status,
        started_at: v.startedAt,
        finished_at: v.status === 'running' ? null : v.startedAt,
        cases_total: caseIds.length,
        cases_completed: 0,
        cases_errored: 0,
        cases_passed: 0,
        recall: null,
        precision: null,
        citation_accuracy: null,
        unlabelled_findings: 0,
        cost_usd: null,
        ...v.metrics,
      };
      runs.push({ workspaceId: v.workspaceId ?? WS, summary, caseIds });
      for (const result of v.results ?? []) results.push({ runId: id, result });
      return summary;
    },

    async listCases(ws, agentId) {
      return cases
        .filter((c) => c.workspaceId === ws && c.agentId === agentId)
        .map(withLatest);
    },

    async insertCase(values: NewEvalCase, limit): Promise<EvalCaseRecord | InsertCaseFailure> {
      const mine = cases.filter((c) => c.workspaceId === values.workspaceId && c.agentId === values.agentId);
      if (mine.length >= limit) return 'limit';
      if (
        values.sourceFindingId &&
        cases.some((c) => c.record.source_finding_id === values.sourceFindingId)
      ) {
        return 'duplicate';
      }
      return store.seedCase({
        agentId: values.agentId,
        workspaceId: values.workspaceId,
        name: values.name,
        inputDiff: values.inputDiff,
        expected: values.expectedOutput,
        sourceFindingId: values.sourceFindingId,
        prTitle: values.inputMeta.pr_title,
        prBody: values.inputMeta.pr_body,
      });
    },

    async getCase(ws, caseId) {
      const row = cases.find((c) => c.workspaceId === ws && c.record.id === caseId);
      return row ? withLatest(row) : undefined;
    },

    async updateCase(ws, caseId, changes: EvalCaseChanges) {
      const row = cases.find((c) => c.workspaceId === ws && c.record.id === caseId);
      if (!row) return undefined;
      row.record = {
        ...row.record,
        name: changes.name,
        input_diff: changes.inputDiff,
        input_meta: changes.inputMeta,
        expected_output: changes.expectedOutput,
        latest: { ...row.record.latest, expected_count: expectedCount(changes.expectedOutput) },
      };
      return withLatest(row);
    },

    async deleteCaseIfIdle(ws, caseId): Promise<DeleteCaseResult> {
      const index = cases.findIndex((c) => c.workspaceId === ws && c.record.id === caseId);
      if (index < 0) return 'not_found';
      if (hasRunning(cases[index]!.agentId)) return 'running';
      cases.splice(index, 1);
      return 'deleted';
    },

    async claimRun(values) {
      claims.push(values);
      if (hasRunning(values.agentId)) return null;
      return store.seedRun({
        agentId: values.agentId,
        workspaceId: values.workspaceId,
        status: 'running',
        startedAt: new Date(2026, 9, 15, 12, 0, runs.length).toISOString(),
        agentVersion: values.agentVersion,
        caseIds: values.caseIds,
        metrics: { skill_versions: values.skillVersions, finished_at: null },
      });
    },

    async recordCaseResult(runId, result) {
      const run = runs.find((r) => r.summary.id === runId);
      if (!run || run.summary.status !== 'running') {
        settle(runId, run?.summary.status ?? 'missing');
        return false;
      }
      results.push({ runId, result });
      const s = run.summary;
      if (result.status === 'error') s.cases_errored += 1;
      else s.cases_completed += 1;
      if (result.status === 'pass') s.cases_passed += 1;
      return true;
    },

    async finishRun(runId, status, metrics: RunMetrics) {
      const run = runs.find((r) => r.summary.id === runId);
      if (!run || run.summary.status !== 'running') return false;
      Object.assign(run.summary, {
        status,
        finished_at: new Date(2026, 9, 15, 12, 5).toISOString(),
        recall: metrics.recall,
        precision: metrics.precision,
        citation_accuracy: metrics.citationAccuracy,
        unlabelled_findings: metrics.unlabelledFindings,
        cost_usd: metrics.costUsd,
      });
      settle(runId, status);
      return true;
    },

    async listRuns(ws, agentId, limit) {
      return runs
        .filter((r) => r.workspaceId === ws && r.summary.agent_id === agentId)
        .map((r) => r.summary)
        .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id))
        .slice(0, limit);
    },

    async latestCounted(ws, agentId, n) {
      return countedRuns(ws, agentId)
        .slice(0, n)
        .map((r) => r.summary);
    },

    async getRuns(ws, ids) {
      return runs.filter((r) => r.workspaceId === ws && ids.includes(r.summary.id)).map((r) => r.summary);
    },

    async caseIdsOfRuns(ids) {
      return new Map(runs.filter((r) => ids.includes(r.summary.id)).map((r) => [r.summary.id, r.caseIds]));
    },

    async caseResults(ids) {
      return results.filter((r) => ids.includes(r.runId));
    },

    async caseNames(ws, ids) {
      return new Map(
        cases
          .filter((c) => c.workspaceId === ws && ids.includes(c.record.id))
          .map((c) => [c.record.id, c.record.name]),
      );
    },

    async latestCountedByAgent(ws) {
      const out = new Map<string, EvalRunSummary>();
      for (const r of countedRuns(ws)) if (!out.has(r.summary.agent_id)) out.set(r.summary.agent_id, r.summary);
      return out;
    },

    async recentCounted(ws, n) {
      return countedRuns(ws)
        .slice(0, n)
        .map((r) => r.summary);
    },

    async trend(ws, agentId): Promise<EvalTrendPoint[]> {
      return [...countedRuns(ws, agentId)].reverse().map((r) => ({
        run_id: r.summary.id,
        started_at: r.summary.started_at,
        agent_version: r.summary.agent_version,
        recall: r.summary.recall,
        precision: r.summary.precision,
        citation_accuracy: r.summary.citation_accuracy,
        cost_usd: r.summary.cost_usd,
      }));
    },

    async reapRunning() {
      let n = 0;
      for (const r of runs) {
        if (r.summary.status === 'running') {
          r.summary.status = 'failed';
          n += 1;
        }
      }
      return n;
    },

    async caseIdsBySourceFinding(ws, findingIds) {
      return new Map(
        cases
          .filter(
            (c) =>
              c.workspaceId === ws &&
              c.record.source_finding_id !== null &&
              findingIds.includes(c.record.source_finding_id),
          )
          .map((c) => [c.record.source_finding_id!, c.record.id]),
      );
    },
  };
  return store;
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

/** What the canned model answers for the case whose diff touches a file. */
export type CannedAnswer = Finding[] | 'throw' | 'hang';

export interface CannedLlm extends LLMProvider {
  /** Every structured request, in order. */
  readonly requests: StructuredRequest<unknown>[];
  /** The text of one request's messages, for prompt assertions. */
  promptOf(index: number): string;
}

export interface CannedLlmOptions {
  answers?: Record<string, CannedAnswer>;
  costUsd?: number | null;
  /** When set, every answer waits for it first (hold a run mid-flight). */
  gate?: Promise<void>;
}

/** A provider that answers by the file named in the prompt and never touches a network. */
export function cannedLlm(opts: CannedLlmOptions = {}): CannedLlm {
  const requests: StructuredRequest<unknown>[] = [];
  const provider: CannedLlm = {
    id: 'openrouter',
    requests,
    promptOf: (i) => requests[i]!.messages.map((m) => m.content).join('\n'),
    async listModels() {
      return [];
    },
    async complete(): Promise<never> {
      throw new Error('complete is not used by an eval review');
    },
    async embed() {
      return [];
    },
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      requests.push(req as StructuredRequest<unknown>);
      if (opts.gate) await opts.gate;
      const prompt = req.messages.map((m) => m.content).join('\n');
      const file = Object.keys(opts.answers ?? {}).find((f) => prompt.includes(`a/${f}`));
      const answer = file ? opts.answers![file]! : [];
      if (answer === 'throw') throw new Error('provider says: structured output failed schema validation');
      if (answer === 'hang') return new Promise<never>(() => undefined);
      const data = req.schema.parse({
        verdict: 'comment',
        summary: 'canned',
        score: 70,
        findings: answer,
      });
      return {
        data,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: opts.costUsd === undefined ? 0.5 : opts.costUsd,
        raw: '{}',
        attempts: 1,
      };
    },
  };
  return provider;
}

// ---------------------------------------------------------------------------
// agents and findings
// ---------------------------------------------------------------------------

export function evalAgent(over: Partial<EvalAgent> = {}): EvalAgent {
  return {
    id: AGENT_ID,
    name: 'Security',
    provider: 'openrouter',
    model: 'canned-model',
    systemPrompt: 'You review code.',
    strategy: 'single-pass',
    version: 3,
    ...over,
  };
}

export interface FakeAgents extends EvalAgentSource {
  agents: Map<string, EvalAgent & { workspaceId: string }>;
  skills: EvalSkill[];
  versions: Map<string, unknown>;
  /** how many times `resolvedSkills` / `getById` were called */
  reads: { resolvedSkills: number; getById: number };
}

export function fakeAgents(
  agent: EvalAgent = evalAgent(),
  skills: EvalSkill[] = [],
  workspaceId = WS,
): FakeAgents {
  const agents = new Map([[agent.id, { ...agent, workspaceId }]]);
  const reads = { resolvedSkills: 0, getById: 0 };
  const fake: FakeAgents = {
    agents,
    skills,
    versions: new Map(),
    reads,
    async getById(ws, id) {
      reads.getById += 1;
      const a = agents.get(id);
      if (!a || a.workspaceId !== ws) return undefined;
      const { workspaceId: _w, ...rest } = a;
      return rest;
    },
    async list(ws) {
      return [...agents.values()].filter((a) => a.workspaceId === ws).map((a) => ({ id: a.id, name: a.name }));
    },
    async getVersion(agentId, version) {
      const cfg = fake.versions.get(`${agentId}:${version}`);
      return cfg === undefined ? undefined : { configJson: cfg };
    },
    async resolvedSkills() {
      reads.resolvedSkills += 1;
      return fake.skills;
    },
  };
  return fake;
}

export function fakeFindings(
  list: Array<{ id: string; agentId: string | null; workspaceId?: string; file?: string; start?: number; end?: number }>,
): EvalFindingSource {
  return {
    async findingContext(findingId) {
      const f = list.find((x) => x.id === findingId);
      if (!f) return undefined;
      return {
        finding: { id: f.id, file: f.file ?? 'src/a.ts', startLine: f.start ?? 10, endLine: f.end ?? 12 },
        review: { agentId: f.agentId },
        pull: { workspaceId: f.workspaceId ?? WS },
      };
    },
  };
}

export function llmFor(provider: LLMProvider, only: Provider = 'openrouter') {
  return async (p: Provider): Promise<LLMProvider> => {
    if (p !== only) throw new Error(`unexpected provider ${p}`);
    return provider;
  };
}
