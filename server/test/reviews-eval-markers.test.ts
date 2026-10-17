import { describe, expect, it, vi } from 'vitest';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import type { ReviewDeps } from '../src/modules/reviews/deps.js';
import type { FindingRow, PullRow, ReviewRow, ReviewStore } from '../src/modules/reviews/ports.js';
import type { AgentStore } from '../src/modules/agents/types.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * SPEC-13 finding markers (`eval_case_id`, `eval_unavailable_reason`) as `reviewsForPull` returns
 * them: AC-1, AC-8, AC-9, AC-65, EC-1, EC-2, EC-3, EC-20. Stores are fakes; the pure
 * `withEvalMarkers` rules run through the service the way the route uses them.
 */

// New side of the patch below: lines 10-13.
const PATCH = ['@@ -10,3 +10,4 @@', ' context a', '+added line', ' context b', ' context c', ''].join('\n');

function reviewRow(id: string, agentId: string | null): ReviewRow {
  return {
    id,
    workspaceId: 'ws',
    prId: 'pr1',
    agentId,
    runId: null,
    kind: 'review',
    verdict: 'comment',
    summary: null,
    score: 90,
    model: 'm',
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
  } as ReviewRow;
}

function findingRow(id: string, file: string, start: number, end: number, over: Partial<FindingRow> = {}): FindingRow {
  return {
    id,
    reviewId: 'r1',
    file,
    startLine: start,
    endLine: end,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${id}`,
    rationale: 'why',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  };
}

interface Setup {
  files: Array<{ path: string; patch: string | null }>;
  reviews: Array<{ review: ReviewRow; findings: FindingRow[]; batchId: string | null }>;
  cases?: Map<string, string>;
}

function setup(s: Setup) {
  const getPrFiles = vi.fn(async () => s.files);
  const caseIdsBySourceFinding = vi.fn(async (_ws: string, _ids: string[]) => s.cases ?? new Map<string, string>());
  const store = {
    getPull: async (ws: string, id: string) =>
      ws === 'ws' && id === 'pr1' ? ({ id: 'pr1', workspaceId: 'ws' } as PullRow) : undefined,
    reviewsForPull: async () => s.reviews,
    getPrFiles,
  } as unknown as ReviewStore;
  const agents = {
    namesByIds: async (_ws: string, ids: string[]) => new Map(ids.map((id) => [id, `Agent ${id}`])),
  } as unknown as AgentStore;
  const deps: ReviewDeps = {
    reviews: store,
    agents,
    git: new MockGitClient(),
    llm: async () => new MockLLMProvider('openai'),
    repoIntel: {} as RepoIntel,
    intent: { forRun: async () => null },
    projectContext: { resolveForRun: async () => ({ documents: [], records: [] }) },
    evalCases: { caseIdsBySourceFinding },
    tokenizer: { count: () => 0 },
    bus: new RunBus(1_000),
  };
  return { service: new ReviewService(deps), getPrFiles, caseIdsBySourceFinding };
}

const markersOf = async (service: ReviewService) =>
  Object.fromEntries(
    (await service.reviewsForPull('ws', 'pr1')).flatMap((r) =>
      r.findings.map((f) => [f.id, [f.eval_case_id ?? null, f.eval_unavailable_reason ?? null]] as const),
    ),
  );

describe('reviewsForPull eval markers', () => {
  it('AC-1: a finding with an agent, a stored patch and an intersecting range has no reason, whatever its decision', async () => {
    const { service } = setup({
      files: [{ path: 'src/db.ts', patch: PATCH }],
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [
            findingRow('open', 'src/db.ts', 11, 12),
            findingRow('accepted', 'src/db.ts', 10, 10, { acceptedAt: new Date() }),
            findingRow('dismissed', 'src/db.ts', 13, 20, { dismissedAt: new Date() }), // touches the last line
          ],
          batchId: null,
        },
      ],
    });

    expect(await markersOf(service)).toEqual({
      open: [null, null],
      accepted: [null, null],
      dismissed: [null, null],
    });
  });

  it('AC-8, EC-1: a finding of a review with no agent is `no_agent`', async () => {
    const { service } = setup({
      files: [{ path: 'src/db.ts', patch: PATCH }],
      reviews: [{ review: reviewRow('r1', null), findings: [findingRow('f1', 'src/db.ts', 11, 12)], batchId: null }],
    });
    expect(await markersOf(service)).toEqual({ f1: [null, 'no_agent'] });
  });

  it('AC-8, EC-2: no hunk new-side range intersects the finding range → `diff_unavailable`', async () => {
    const { service } = setup({
      files: [{ path: 'src/db.ts', patch: PATCH }],
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [findingRow('past-end', 'src/db.ts', 14, 20), findingRow('before', 'src/db.ts', 1, 9)],
          batchId: null,
        },
      ],
    });
    expect(await markersOf(service)).toEqual({
      'past-end': [null, 'diff_unavailable'],
      before: [null, 'diff_unavailable'],
    });
  });

  it('AC-8, EC-2: a file with no stored patch, or no stored file at all, is `diff_unavailable`', async () => {
    const { service } = setup({
      files: [{ path: 'src/binary.png', patch: null }],
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [findingRow('nopatch', 'src/binary.png', 1, 1), findingRow('gone', 'src/removed.ts', 1, 1)],
          batchId: null,
        },
      ],
    });
    expect(await markersOf(service)).toEqual({
      nopatch: [null, 'diff_unavailable'],
      gone: [null, 'diff_unavailable'],
    });
  });

  it('AC-65, EC-20: a finding on a generated or fixture file is `file_excluded`, even with a good patch', async () => {
    const { service } = setup({
      files: [
        { path: 'pnpm-lock.yaml', patch: PATCH },
        { path: 'server/src/db/migrations/0001_x.sql', patch: PATCH },
      ],
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [
            findingRow('lock', 'pnpm-lock.yaml', 11, 12),
            findingRow('migration', 'server/src/db/migrations/0001_x.sql', 11, 12),
          ],
          batchId: null,
        },
      ],
    });
    expect(await markersOf(service)).toEqual({
      lock: [null, 'file_excluded'],
      migration: [null, 'file_excluded'],
    });
  });

  it('AC-8, AC-65: the reasons are ordered no_agent, then file_excluded, then diff_unavailable', async () => {
    const { service } = setup({
      files: [],
      reviews: [
        // no agent AND excluded AND no patch → no_agent
        { review: reviewRow('r-noagent', null), findings: [findingRow('a', 'yarn.lock', 1, 1)], batchId: null },
        // agent, excluded AND no patch → file_excluded
        { review: reviewRow('r-agent', 'a1'), findings: [findingRow('b', 'yarn.lock', 1, 1)], batchId: null },
      ],
    });
    expect(await markersOf(service)).toEqual({
      a: [null, 'no_agent'],
      b: [null, 'file_excluded'],
    });
  });

  it('AC-9: a finding that seeded a case shows the case id and no reason', async () => {
    const { service } = setup({
      files: [{ path: 'src/db.ts', patch: PATCH }],
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [findingRow('seeded', 'src/db.ts', 11, 12), findingRow('plain', 'src/db.ts', 11, 12)],
          batchId: null,
        },
      ],
      cases: new Map([['seeded', 'case-7']]),
    });
    expect(await markersOf(service)).toEqual({ seeded: ['case-7', null], plain: [null, null] });
  });

  it('EC-3: a seeded finding keeps "In eval set" after its decision changes and after its diff is gone', async () => {
    const { service } = setup({
      files: [], // the PR was re-imported: no stored patch for the file any more
      reviews: [
        {
          review: reviewRow('r1', 'a1'),
          findings: [findingRow('seeded', 'src/db.ts', 11, 12, { dismissedAt: new Date() })],
          batchId: null,
        },
      ],
      cases: new Map([['seeded', 'case-7']]),
    });
    expect(await markersOf(service)).toEqual({ seeded: ['case-7', null] });
  });

  it('AC-1, AC-9: the markers cost one read of the PR files and one case lookup, not one per finding', async () => {
    const findings = Array.from({ length: 12 }, (_, i) => findingRow(`f${i}`, 'src/db.ts', 11, 12));
    const { service, getPrFiles, caseIdsBySourceFinding } = setup({
      files: [{ path: 'src/db.ts', patch: PATCH }],
      reviews: [
        { review: reviewRow('r1', 'a1'), findings: findings.slice(0, 7), batchId: 'b' },
        { review: reviewRow('r2', 'a2'), findings: findings.slice(7), batchId: 'b' },
      ],
    });

    await service.reviewsForPull('ws', 'pr1');

    expect(getPrFiles).toHaveBeenCalledTimes(1);
    expect(caseIdsBySourceFinding).toHaveBeenCalledTimes(1);
    expect(caseIdsBySourceFinding.mock.calls[0]![0]).toBe('ws');
    expect(caseIdsBySourceFinding.mock.calls[0]![1]).toHaveLength(12);
  });
});
