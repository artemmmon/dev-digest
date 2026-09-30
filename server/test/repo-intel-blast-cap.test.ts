import { describe, it, expect, vi } from 'vitest';
import { BLAST_LIMITS } from '@devdigest/shared';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { repoIntelDeps } from './helpers/repo-intel.js';

/**
 * The persistent blast cap is applied PER changed symbol. A global slice let a
 * high-fan-out symbol starve every lower-ranked one of its callers.
 */

function buildService(aCallers = 25): RepoIntelService {
  const decl = (name: string) => ({
    path: 'src/lib.ts',
    name,
    kind: 'function',
    line: 1,
    endLine: 5,
    exported: true,
    signature: null,
  });
  // 25 callers of `a` (ranks 1000..976), 3 of `b` (ranks 10..8): every `a` outranks every `b`.
  const callers = [
    ...Array.from({ length: aCallers }, (_, i) => ({
      fromPath: `src/a-user-${i}.ts`,
      toSymbol: 'a',
      line: 10 + i,
      rank: 1000 - i,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      fromPath: `src/b-user-${i}.ts`,
      toSymbol: 'b',
      line: 3,
      rank: 10 - i,
    })),
  ];
  const repo = {
    tryGetIndexState: async () => ({ status: 'full', lastIndexedSha: 'abc' }),
    getSymbolRows: async (_repoId: string, paths: string[]) =>
      paths.includes('src/lib.ts') ? [decl('a'), decl('b')] : [],
    getResolvedCallers: async () => callers,
    getFileFacts: async () => [],
  } as unknown as RepoIntelRepository;
  return new RepoIntelService(repo, repoIntelDeps({}, { enabled: true }));
}

describe('RepoIntel blast — per-symbol caller cap', () => {
  it('keeps the cap for each symbol independently, rank-sorted', async () => {
    const res = await buildService().getBlastRadius('r1', ['src/lib.ts']);
    expect(res.degraded).toBe(false);
    const max = BLAST_LIMITS.maxCallersPerSymbol;
    const a = res.callers.filter((c) => c.viaSymbol === 'a');
    const b = res.callers.filter((c) => c.viaSymbol === 'b');
    expect(a).toHaveLength(max);
    expect(b).toHaveLength(3);
    const ranks = res.callers.map((c) => c.rank);
    expect(ranks).toEqual([...ranks].sort((x, y) => y - x));
    expect(a[0]?.rank).toBe(1000);
    expect(a.at(-1)?.rank).toBe(1000 - (max - 1));
  });

  it('reports truncated when a symbol exceeds the cap', async () => {
    const res = await buildService().getBlastRadius('r1', ['src/lib.ts']);
    expect(res.truncated).toBe(true);
  });

  it('reports truncated=false when every symbol fits (exactly at the cap included)', async () => {
    const max = BLAST_LIMITS.maxCallersPerSymbol;
    expect((await buildService(max).getBlastRadius('r1', ['src/lib.ts'])).truncated).toBe(false);
    expect((await buildService(2).getBlastRadius('r1', ['src/lib.ts'])).truncated).toBe(false);
  });
});

/**
 * `persistentOnly`: the blast route's "never parses the clone" guarantee must hold even when the
 * index row flips between its state read and the facade's own read.
 */
describe('RepoIntel blast — persistentOnly never takes the clone fallback', () => {
  function buildFallbackSpy(indexState: { status: string; lastIndexedSha: string } | null) {
    const symbols = vi.fn(async () => []);
    const references = vi.fn(async () => []);
    const getRepoBasics = vi.fn(async () => ({
      owner: 'o',
      name: 'n',
      clonePath: '/tmp/never-read',
    }));
    const repo = {
      tryGetIndexState: async () => indexState,
      getRepoBasics,
      getSymbolRows: async () => [],
      getResolvedCallers: async () => [],
      getFileFacts: async () => [],
    } as unknown as RepoIntelRepository;
    const svc = new RepoIntelService(
      repo,
      repoIntelDeps({}, { enabled: true, codeIndex: { symbols, references } as never }),
    );
    return { svc, symbols, references, getRepoBasics };
  }

  it.each([
    ['no state row', null],
    ['a degraded row', { status: 'degraded', lastIndexedSha: '' }],
    ['a failed row', { status: 'failed', lastIndexedSha: '' }],
  ])('returns empty degraded no_data on %s, without touching codeIndex or the clone', async (_n, state) => {
    const { svc, symbols, references, getRepoBasics } = buildFallbackSpy(state);
    const res = await svc.getBlastRadius('r1', ['src/lib.ts'], { persistentOnly: true });
    expect(res).toEqual({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });
    expect(symbols).not.toHaveBeenCalled();
    expect(references).not.toHaveBeenCalled();
    expect(getRepoBasics).not.toHaveBeenCalled();
  });

  it('still takes the fallback by default (existing callers unchanged)', async () => {
    const { svc, symbols } = buildFallbackSpy(null);
    await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(symbols).toHaveBeenCalledTimes(1);
  });

  it('does not change a successful persistent answer', async () => {
    const res = await buildService(2).getBlastRadius('r1', ['src/lib.ts'], { persistentOnly: true });
    expect(res.degraded).toBe(false);
    expect(res.callers.length).toBeGreaterThan(0);
  });
});
