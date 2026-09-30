import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../src/platform/errors.js';
import { BlastService } from '../src/modules/blast/service.js';
import type {
  BlastFacadeResult,
  BlastIndexSnapshot,
  BlastIntel,
  BlastLog,
  BlastPullRef,
  BlastStore,
} from '../src/modules/blast/ports.js';

/**
 * BlastService against an in-memory store and a scripted intel port: the
 * "skip the facade unless the index is usable" and reason rules in isolation.
 */

const PR_ID = 'pr-1';

class InMemoryBlastStore implements BlastStore {
  pulls = new Map<string, BlastPullRef>();
  paths = new Map<string, string[]>();
  async pullInWorkspace(workspaceId: string, prId: string) {
    return workspaceId === 'ws' ? this.pulls.get(prId) : undefined;
  }
  async changedPaths(prId: string) {
    return this.paths.get(prId) ?? [];
  }
}

class FakeIntel implements BlastIntel {
  enabled = true;
  state: BlastIndexSnapshot = { status: 'full', lastIndexedSha: 'idx-sha' };
  result: BlastFacadeResult = { changedSymbols: [], callers: [] };
  blastCalls = 0;
  async indexState() {
    return this.state;
  }
  async blastRadius() {
    this.blastCalls += 1;
    return this.result;
  }
}

class FakeLog implements BlastLog {
  infos: { obj: Record<string, unknown>; msg: string }[] = [];
  info(obj: object, msg: string) {
    this.infos.push({ obj: obj as Record<string, unknown>, msg });
  }
}

function setup() {
  const store = new InMemoryBlastStore();
  store.pulls.set(PR_ID, { id: PR_ID, repoId: 'repo-1', headSha: 'head-sha' });
  store.paths.set(PR_ID, ['src/lib.ts']);
  const intel = new FakeIntel();
  const log = new FakeLog();
  intel.result = {
    changedSymbols: [{ file: 'src/lib.ts', name: 'a', kind: 'function' }],
    callers: [{ file: 'src/x.ts', symbol: 'useA', viaSymbol: 'a', line: 3, rank: 2 }],
    factsByFile: { 'src/x.ts': { endpoints: ['GET /a'], crons: [] } },
  };
  return { store, intel, log, service: new BlastService({ store, intel, log }) };
}

describe('BlastService.forPull', () => {
  it('throws NotFoundError for an unknown PR or another workspace', async () => {
    const { service } = setup();
    await expect(service.forPull('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.forPull('other-ws', PR_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('flag off -> flag_off, facade not called', async () => {
    const { service, intel, log } = setup();
    intel.enabled = false;
    const res = await service.forPull('ws', PR_ID);
    expect(res.index).toMatchObject({ degraded: true, reason: 'flag_off' });
    expect(intel.blastCalls).toBe(0);
    expect(res.blast.downstream).toEqual([]);
    expect(res.counts.changed_files).toBe(1);
    expect(log.infos).toHaveLength(1);
    expect(log.infos[0]!.msg).toBe('blast radius served from the precomputed index');
    expect(log.infos[0]!.obj).toMatchObject({
      prId: PR_ID,
      repoId: 'repo-1',
      facade: 'skipped',
      reason: 'flag_off',
      changedFiles: 1,
      symbols: 0,
    });
  });

  it('degraded index with no row -> no_data, facade not called', async () => {
    const { service, intel } = setup();
    intel.state = { status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data' };
    const res = await service.forPull('ws', PR_ID);
    expect(res.index).toMatchObject({
      status: 'degraded',
      degraded: true,
      reason: 'no_data',
      indexed_sha: null,
    });
    expect(intel.blastCalls).toBe(0);
  });

  it('failed index -> index_failed, facade not called', async () => {
    const { service, intel } = setup();
    intel.state = { status: 'failed', lastIndexedSha: 'idx-sha' };
    const res = await service.forPull('ws', PR_ID);
    expect(res.index.reason).toBe('index_failed');
    expect(intel.blastCalls).toBe(0);
  });

  it('partial -> facade called, index_partial, degraded but the map is shown', async () => {
    const { service, intel } = setup();
    intel.state = { status: 'partial', lastIndexedSha: 'idx-sha' };
    const res = await service.forPull('ws', PR_ID);
    expect(intel.blastCalls).toBe(1);
    expect(res.index).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(res.blast.downstream).toHaveLength(1);
  });

  it('full -> not degraded, grouped map, envelope satisfies the contract', async () => {
    const { service, intel, log } = setup();
    const res = await service.forPull('ws', PR_ID);
    expect(BlastRadiusResponse.safeParse(res).success).toBe(true);
    expect(intel.blastCalls).toBe(1);
    expect(log.infos).toHaveLength(1);
    expect(log.infos[0]!.obj).toEqual({
      prId: PR_ID,
      repoId: 'repo-1',
      facade: 'persistent-index',
      indexStatus: 'full',
      indexedSha: 'idx-sha',
      reason: null,
      changedFiles: 1,
      symbols: 1,
      callers: 1,
      endpoints: 1,
      crons: 0,
      truncated: false,
      source: 'repo-intel index (read-only, no re-parse, no LLM)',
    });
    expect(res.head_sha).toBe('head-sha');
    expect(res.index).toEqual({
      status: 'full',
      degraded: false,
      reason: null,
      indexed_sha: 'idx-sha',
    });
    expect(res.limits.max_callers_per_symbol).toBe(20);
    expect(res.counts).toEqual({
      changed_files: 1,
      symbols: 1,
      callers: 1,
      endpoints: 1,
      crons: 0,
    });
    expect(res.blast.downstream[0]).toMatchObject({
      symbol: 'a',
      endpoints_affected: ['GET /a'],
    });
    expect(res.truncated).toBe(false);
  });

  it('surfaces the facade truncated flag in the envelope', async () => {
    const { service, intel } = setup();
    intel.result = { ...intel.result, truncated: true };
    const res = await service.forPull('ws', PR_ID);
    expect(res.truncated).toBe(true);
    expect(BlastRadiusResponse.safeParse(res).success).toBe(true);
  });

  it('honours a degraded facade result (index changed between the two reads)', async () => {
    const { service, intel } = setup();
    intel.result = { changedSymbols: [], callers: [], degraded: true, reason: 'index_failed' };
    const res = await service.forPull('ws', PR_ID);
    expect(res.index).toMatchObject({ degraded: true, reason: 'index_failed' });
    expect(res.blast.downstream).toEqual([]);
  });

  it('no pr_files -> changed_files 0, facade not called', async () => {
    const { service, store, intel } = setup();
    store.paths.set(PR_ID, []);
    const res = await service.forPull('ws', PR_ID);
    expect(res.counts.changed_files).toBe(0);
    expect(intel.blastCalls).toBe(0);
    expect(res.blast.summary).toBe('No indexed symbols in the changed files.');
  });
});
