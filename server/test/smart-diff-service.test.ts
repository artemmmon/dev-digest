import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../src/platform/errors.js';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type {
  SmartDiffFileRow,
  SmartDiffFindingLocation,
  SmartDiffPullRef,
  SmartDiffRoundInputs,
  SmartDiffStore,
} from '../src/modules/smart-diff/ports.js';

/**
 * SmartDiffService against an in-memory SmartDiffStore (onion-architecture
 * patterns §8): no DB, no HTTP, no LLM — the "latest round" + grouping rules in
 * isolation (spec 09).
 */

const PR_ID = 'pr-1';

class InMemorySmartDiffStore implements SmartDiffStore {
  pulls = new Map<string, SmartDiffPullRef>();
  filesByPr = new Map<string, SmartDiffFileRow[]>();
  round: SmartDiffRoundInputs = { runs: [], reviews: [] };
  findingsByReview = new Map<string, SmartDiffFindingLocation[]>();

  async pullInWorkspace(workspaceId: string, prId: string) {
    return workspaceId === 'ws' ? this.pulls.get(prId) : undefined;
  }
  async files(prId: string) {
    return this.filesByPr.get(prId) ?? [];
  }
  async roundInputs() {
    return this.round;
  }
  async findingLocations(reviewIds: string[]) {
    return reviewIds.flatMap((id) => this.findingsByReview.get(id) ?? []);
  }
}

function makeStore(): InMemorySmartDiffStore {
  const store = new InMemorySmartDiffStore();
  store.pulls.set(PR_ID, { id: PR_ID });
  store.filesByPr.set(PR_ID, [
    { path: 'server/src/modules/pulls/service.ts', additions: 10, deletions: 2 },
    { path: 'server/pnpm-lock.yaml', additions: 100, deletions: 0 },
  ]);
  return store;
}

describe('SmartDiffService.forPull', () => {
  it('no reviews → 5 groups, every finding_lines empty', async () => {
    const store = makeStore();
    const service = new SmartDiffService({ store });
    const result = await service.forPull('ws', PR_ID);

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    for (const group of result.groups) {
      for (const file of group.files) expect(file.finding_lines).toEqual([]);
    }
    const totalFiles = result.groups.reduce((n, g) => n + g.files.length, 0);
    expect(totalFiles).toBe(2);
  });

  it('two batches → only the newest batch’s lines count', async () => {
    const store = makeStore();
    store.round = {
      runs: [
        { prId: PR_ID, id: 'run-2', batchId: 'batch-2' },
        { prId: PR_ID, id: 'run-1', batchId: 'batch-1' },
      ],
      reviews: [
        { prId: PR_ID, id: 'review-2', runId: 'run-2' },
        { prId: PR_ID, id: 'review-1', runId: 'run-1' },
      ],
    };
    store.findingsByReview.set('review-2', [
      { file: 'server/src/modules/pulls/service.ts', startLine: 10 },
    ]);
    store.findingsByReview.set('review-1', [
      { file: 'server/src/modules/pulls/service.ts', startLine: 999 },
    ]);

    const service = new SmartDiffService({ store });
    const result = await service.forPull('ws', PR_ID);
    const core = result.groups.find((g) => g.role === 'core')!;
    const coreFile = core.files.find((f) => f.path === 'server/src/modules/pulls/service.ts')!;
    expect(coreFile.finding_lines).toEqual([10]);
  });

  it('duplicate start lines are deduplicated', async () => {
    const store = makeStore();
    store.round = {
      runs: [{ prId: PR_ID, id: 'run-1', batchId: 'batch-1' }],
      reviews: [{ prId: PR_ID, id: 'review-1', runId: 'run-1' }],
    };
    store.findingsByReview.set('review-1', [
      { file: 'server/src/modules/pulls/service.ts', startLine: 5 },
      { file: 'server/src/modules/pulls/service.ts', startLine: 5 },
      { file: 'server/src/modules/pulls/service.ts', startLine: 1 },
    ]);

    const service = new SmartDiffService({ store });
    const result = await service.forPull('ws', PR_ID);
    const core = result.groups.find((g) => g.role === 'core')!;
    const coreFile = core.files.find((f) => f.path === 'server/src/modules/pulls/service.ts')!;
    expect(coreFile.finding_lines).toEqual([1, 5]);
  });

  it('unknown PR → NotFoundError', async () => {
    const store = makeStore();
    const service = new SmartDiffService({ store });
    await expect(service.forPull('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the result passes SmartDiff.parse', async () => {
    const store = makeStore();
    const service = new SmartDiffService({ store });
    const result = await service.forPull('ws', PR_ID);
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});
