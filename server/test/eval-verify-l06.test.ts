import { describe, expect, it } from 'vitest';
import type {
  EvalCaseResult,
  EvalExpectation,
  EvalRunSummary,
  Finding,
  LLMProvider,
  Provider,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';
import { EvalRunExecutor } from '../src/modules/eval/run-executor.js';
import { aggregate, runStatus } from '../src/modules/eval/scoring.js';
import type {
  CapturedCase,
  EvalDeps,
  EvalStore,
  RunCapture,
  RunCaseResult,
  RunMetrics,
} from '../src/modules/eval/ports.js';

/**
 * AC-51 / NFR-1 — the scoring check behind `pnpm verify:l06`. Runs the real `EvalRunExecutor`
 * and `scoring.ts` over a case set that yields every metric, with a canned model and an
 * in-memory store: no database, no network, no API key.
 */

const RUN_ID = 'run-1';
const AGENT_ID = 'agent-1';

/** A one-hunk diff of `file` whose new side is lines 10-13. */
function diffFor(file: string): string {
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

function expectation(
  type: EvalExpectation['type'],
  file: string,
  start_line: number,
  end_line: number,
): EvalExpectation {
  return { type, file, start_line, end_line };
}

function caseOf(id: string, file: string, exp: EvalExpectation): CapturedCase {
  return {
    id,
    name: `case ${id}`,
    inputDiff: diffFor(file),
    inputMeta: { pr_title: `Change number ${id}`, pr_body: '' },
    expectedOutput: exp,
  };
}

/** Cases: two pass, two fail, one passes with a dropped citation, one errors. */
const CASES: CapturedCase[] = [
  caseOf('c1', 'src/auth.ts', expectation('must_find', 'src/auth.ts', 10, 12)),
  caseOf('c2', 'src/db.ts', expectation('must_find', 'src/db.ts', 10, 11)),
  caseOf('c3', 'src/util.ts', expectation('must_not_flag', 'src/util.ts', 10, 11)),
  caseOf('c4', 'src/cfg.ts', expectation('must_not_flag', 'src/cfg.ts', 10, 11)),
  caseOf('c5', 'src/cite.ts', expectation('must_find', 'src/cite.ts', 10, 11)),
  caseOf('c6', 'src/boom.ts', expectation('must_find', 'src/boom.ts', 10, 11)),
];

function finding(id: string, file: string, line: number): Finding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `Problem at ${file}:${line}`,
    file,
    start_line: line,
    end_line: line,
    rationale: 'canned',
    confidence: 0.9,
  };
}

/** The canned model's answer per file touched by the case diff. */
const CANNED: Record<string, Finding[] | 'throw'> = {
  'src/auth.ts': [finding('f1', 'src/auth.ts', 11)], // inside the expectation → TP
  'src/db.ts': [finding('f2', 'src/db.ts', 13)], // grounded but off the expectation → unlabelled
  'src/util.ts': [], // must_not_flag, nothing flagged → pass
  'src/cfg.ts': [finding('f3', 'src/cfg.ts', 10)], // must_not_flag, flagged → FP
  'src/cite.ts': [finding('f4', 'src/cite.ts', 10), finding('f5', 'src/cite.ts', 90)], // line 90 is off the diff → dropped
  'src/boom.ts': 'throw',
};

/** A canned provider: picks its answer from the file named in the prompt, never touches a network. */
function cannedProvider(): LLMProvider & { calls: number } {
  const provider = {
    id: 'openrouter' as const,
    calls: 0,
    async listModels() {
      return [];
    },
    async complete(): Promise<never> {
      throw new Error('complete is not used by a review');
    },
    async embed(): Promise<number[][]> {
      return [];
    },
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      provider.calls += 1;
      const prompt = req.messages.map((m) => JSON.stringify(m.content)).join('\n');
      const file = Object.keys(CANNED).find((f) => prompt.includes(`a/${f}`));
      const answer = file ? CANNED[file] : [];
      if (answer === 'throw') throw new Error('canned provider failure');
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
        costUsd: 0.5,
        raw: '{}',
        attempts: 1,
      };
    },
  };
  return provider;
}

/** Only what the executor touches is real; the rest of `EvalStore` fails loudly if it is used. */
function memoryStore() {
  const results: EvalCaseResult[] = [];
  let finished: { status: string; metrics: RunMetrics } | null = null;
  const unused = async (): Promise<never> => {
    throw new Error('not used by the executor');
  };
  const store: EvalStore = {
    listCases: unused,
    insertCase: unused,
    getCase: unused,
    updateCase: unused,
    deleteCaseIfIdle: unused,
    claimRun: unused as unknown as EvalStore['claimRun'],
    recordCaseResult: async (_runId, result) => {
      results.push(result);
      return true;
    },
    finishRun: async (_runId, status, metrics) => {
      finished = { status, metrics };
      return true;
    },
    listRuns: unused,
    latestCounted: unused,
    getRuns: unused,
    caseIdsOfRuns: async () => new Map([[RUN_ID, CASES.map((c) => c.id)]]),
    caseResults: async (): Promise<RunCaseResult[]> =>
      results.map((result) => ({ runId: RUN_ID, result })),
    caseNames: async () => new Map(CASES.map((c) => [c.id, c.name])),
    latestCountedByAgent: async () => new Map<string, EvalRunSummary>(),
    recentCounted: async () => [],
    trend: async () => [],
    reapRunning: async () => 0,
    caseIdsBySourceFinding: async () => new Map(),
  };
  return { store, results, finished: () => finished };
}

describe('pnpm verify:l06 — scoring runs with no model provider configured', () => {
  it('AC-51: the executor and scorer compute every metric over a canned model', async () => {
    const secrets = new MockSecretsProvider({});
    const canned = cannedProvider();
    // `deps.llm` throws for every provider but the canned one: no key, no network.
    const llm: EvalDeps['llm'] = async (provider: Provider) => {
      if (provider !== 'openrouter') {
        throw new AppError('config_error', `no key for ${provider}`, 500);
      }
      return canned;
    };
    await expect(llm('openai')).rejects.toBeInstanceOf(AppError);
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) {
      expect(await secrets.get(key)).toBeUndefined();
    }

    const { store, results, finished } = memoryStore();
    const capture: RunCapture = {
      runId: RUN_ID,
      agent: {
        id: AGENT_ID,
        name: 'Verify agent',
        model: 'canned-model',
        systemPrompt: 'You review code.',
        strategy: 'single-pass',
        version: 1,
      },
      skills: [],
      cases: CASES,
      llm: await llm('openrouter'),
    };

    await new EvalRunExecutor({ store }).run(capture);

    // one request per case (NFR-2 / user decision), no retries
    expect(canned.calls).toBe(CASES.length);
    expect(results.map((r) => [r.case_id, r.status])).toEqual([
      ['c1', 'pass'],
      ['c2', 'fail'],
      ['c3', 'pass'],
      ['c4', 'fail'],
      ['c5', 'pass'],
      ['c6', 'error'],
    ]);
    const c5 = results.find((r) => r.case_id === 'c5')!;
    expect(c5).toMatchObject({ kept: 1, dropped: 1, matched_count: 1 });

    // every metric of AC-31 to AC-36, by hand
    const agg = aggregate(results);
    expect(agg.recall).toBeCloseTo(2 / 3); // must_find passed 2 of 3 completed
    expect(agg.precision).toBeCloseTo(2 / 3); // 2 true positives, 1 false positive
    expect(agg.citation_accuracy).toBeCloseTo(4 / 5); // 4 kept, 1 dropped
    expect(agg.unlabelled_findings).toBe(1); // the grounded finding off the expectation
    expect(agg.cost_usd).toBeCloseTo(2.5); // five completed cases at 0.5 each
    expect(agg).toMatchObject({ cases_passed: 3, cases_completed: 5, cases_errored: 1 });
    expect(runStatus(agg.cases_completed, agg.cases_errored)).toBe('partial');

    // the executor stored the same numbers it finished the run with
    expect(finished()).toEqual({
      status: 'partial',
      metrics: {
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        unlabelledFindings: 1,
        costUsd: agg.cost_usd,
      },
    });
  });
});
