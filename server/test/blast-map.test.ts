import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import {
  blastReason,
  emptyBlast,
  shouldQueryFacade,
  toBlastRadius,
} from '../src/modules/blast/map.js';
import type { BlastFacadeResult, BlastIndexSnapshot } from '../src/modules/blast/ports.js';

type Caller = BlastFacadeResult['callers'][number];
const caller = (over: Partial<Caller> & Pick<Caller, 'file' | 'viaSymbol'>): Caller => ({
  symbol: 'fn',
  line: 1,
  rank: 1,
  ...over,
});
const facade = (over: Partial<BlastFacadeResult>): BlastFacadeResult => ({
  changedSymbols: [],
  callers: [],
  ...over,
});
const snap = (over: Partial<BlastIndexSnapshot>): BlastIndexSnapshot => ({
  status: 'full',
  lastIndexedSha: 'abc',
  ...over,
});

describe('blastReason', () => {
  it('flag off wins over any state', () => {
    expect(blastReason(false, snap({ status: 'full' }))).toBe('flag_off');
  });
  it('maps each index status', () => {
    expect(blastReason(true, snap({ status: 'full' }))).toBeNull();
    expect(blastReason(true, snap({ status: 'partial' }))).toBe('index_partial');
    expect(blastReason(true, snap({ status: 'failed' }))).toBe('index_failed');
  });
  it('degraded keeps a valid stored reason', () => {
    expect(blastReason(true, snap({ status: 'degraded', degradedReason: 'repo_too_large' }))).toBe(
      'repo_too_large',
    );
  });
  it('degraded with an unknown or missing reason -> no_data', () => {
    expect(blastReason(true, snap({ status: 'degraded', degradedReason: 'weird' }))).toBe('no_data');
    expect(blastReason(true, snap({ status: 'degraded' }))).toBe('no_data');
  });
});

describe('shouldQueryFacade', () => {
  it('only for a usable index and at least one file', () => {
    expect(shouldQueryFacade(null, 1)).toBe(true);
    expect(shouldQueryFacade('index_partial', 1)).toBe(true);
    expect(shouldQueryFacade(null, 0)).toBe(false);
    for (const r of ['flag_off', 'no_data', 'index_failed', 'repo_too_large'] as const) {
      expect(shouldQueryFacade(r, 3)).toBe(false);
    }
  });
});

describe('toBlastRadius', () => {
  it('groups callers by changed symbol and satisfies the BlastRadius contract', () => {
    const res = toBlastRadius(
      facade({
        changedSymbols: [{ file: 'lib.ts', name: 'a', kind: 'function' }],
        callers: [
          caller({ file: 'x.ts', viaSymbol: 'a', symbol: 'useA', line: 4 }),
          caller({ file: 'y.ts', viaSymbol: 'a', symbol: 'other', line: 9 }),
        ],
      }),
      20,
    );
    expect(BlastRadius.safeParse(res.blast).success).toBe(true);
    expect(res.blast.downstream).toHaveLength(1);
    expect(res.blast.downstream[0]?.symbol).toBe('a');
    expect(res.blast.downstream[0]?.callers.map((c) => c.name).sort()).toEqual(['other', 'useA']);
  });

  it('dedupes changed symbols by name+file', () => {
    const res = toBlastRadius(
      facade({
        changedSymbols: [
          { file: 'lib.ts', name: 'a', kind: 'function' },
          { file: 'lib.ts', name: 'a', kind: 'function' },
          { file: 'other.ts', name: 'a', kind: 'function' },
        ],
      }),
      20,
    );
    expect(res.blast.changed_symbols).toHaveLength(2);
    expect(res.counts.symbols).toBe(2);
  });

  it('dedupes callers by (file, symbol) within a symbol', () => {
    const res = toBlastRadius(
      facade({
        callers: [
          caller({ file: 'x.ts', viaSymbol: 'a', symbol: 'f', line: 30 }),
          caller({ file: 'x.ts', viaSymbol: 'a', symbol: 'f', line: 10 }),
        ],
      }),
      20,
    );
    expect(res.blast.downstream[0]?.callers).toEqual([{ name: 'f', file: 'x.ts', line: 10 }]);
  });

  it('caps callers per symbol and flags truncated', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      caller({ file: `f${i}.ts`, viaSymbol: 'a', rank: 10 - i }),
    );
    const res = toBlastRadius(
      facade({ callers: [...many, caller({ file: 'z.ts', viaSymbol: 'b' })] }),
      3,
    );
    const a = res.blast.downstream.find((d) => d.symbol === 'a');
    const b = res.blast.downstream.find((d) => d.symbol === 'b');
    expect(a?.callers.map((c) => c.file)).toEqual(['f0.ts', 'f1.ts', 'f2.ts']);
    expect(b?.callers).toHaveLength(1);
    expect(res.truncated).toBe(true);
    expect(toBlastRadius(facade({ callers: many }), 5).truncated).toBe(false);
  });

  it('propagates the facade truncated flag even when the mapper cuts nothing', () => {
    const few = [caller({ file: 'f0.ts', viaSymbol: 'a' })];
    expect(toBlastRadius(facade({ callers: few, truncated: true }), 20).truncated).toBe(true);
    expect(toBlastRadius(facade({ callers: few, truncated: false }), 20).truncated).toBe(false);
    expect(toBlastRadius(facade({ callers: few }), 20).truncated).toBe(false);
  });

  it('sorts callers by rank desc, file asc, line asc; symbols by best rank, count, name', () => {
    const res = toBlastRadius(
      facade({
        callers: [
          caller({ file: 'b.ts', viaSymbol: 'low', symbol: 's1', rank: 5, line: 2 }),
          caller({ file: 'a.ts', viaSymbol: 'low', symbol: 's2', rank: 5, line: 9 }),
          caller({ file: 'a.ts', viaSymbol: 'low', symbol: 's3', rank: 5, line: 3 }),
          caller({ file: 'c.ts', viaSymbol: 'high', symbol: 's4', rank: 50 }),
          caller({ file: 'd.ts', viaSymbol: 'tieB', symbol: 's5', rank: 20 }),
          caller({ file: 'e.ts', viaSymbol: 'tieA', symbol: 's6', rank: 20 }),
        ],
      }),
      20,
    );
    expect(res.blast.downstream.map((d) => d.symbol)).toEqual(['high', 'tieA', 'tieB', 'low']);
    const low = res.blast.downstream.find((d) => d.symbol === 'low');
    expect(low?.callers.map((c) => `${c.file}:${c.line}`)).toEqual(['a.ts:3', 'a.ts:9', 'b.ts:2']);
  });

  it('orders symbols with more callers first when best ranks tie', () => {
    const res = toBlastRadius(
      facade({
        callers: [
          caller({ file: 'a.ts', viaSymbol: 'few', symbol: 'x', rank: 7 }),
          caller({ file: 'b.ts', viaSymbol: 'many', symbol: 'y', rank: 7 }),
          caller({ file: 'c.ts', viaSymbol: 'many', symbol: 'z', rank: 7 }),
        ],
      }),
      20,
    );
    expect(res.blast.downstream.map((d) => d.symbol)).toEqual(['many', 'few']);
  });

  it('attributes endpoints/crons per symbol from its own callers, sorted and unique', () => {
    const res = toBlastRadius(
      facade({
        callers: [
          caller({ file: 'r1.ts', viaSymbol: 'a', symbol: 'h1', rank: 3 }),
          caller({ file: 'r2.ts', viaSymbol: 'a', symbol: 'h2', rank: 2 }),
          caller({ file: 'r3.ts', viaSymbol: 'b', symbol: 'h3', rank: 1 }),
        ],
        factsByFile: {
          'r1.ts': { endpoints: ['POST /z', 'GET /a'], crons: [] },
          'r2.ts': { endpoints: ['GET /a'], crons: ['0 * * * *'] },
          'r3.ts': { endpoints: ['GET /only-b'], crons: [] },
        },
      }),
      20,
    );
    const a = res.blast.downstream.find((d) => d.symbol === 'a');
    const b = res.blast.downstream.find((d) => d.symbol === 'b');
    expect(a?.endpoints_affected).toEqual(['GET /a', 'POST /z']);
    expect(a?.crons_affected).toEqual(['0 * * * *']);
    expect(b?.endpoints_affected).toEqual(['GET /only-b']);
    expect(res.counts).toMatchObject({ endpoints: 3, crons: 1 });
  });

  it('endpoints/crons are empty when factsByFile is absent', () => {
    const res = toBlastRadius(
      facade({ callers: [caller({ file: 'x.ts', viaSymbol: 'a' })] }),
      20,
    );
    expect(res.blast.downstream[0]?.endpoints_affected).toEqual([]);
    expect(res.blast.downstream[0]?.crons_affected).toEqual([]);
  });

  it('counts unique (file, name) callers across symbols', () => {
    const res = toBlastRadius(
      facade({
        changedSymbols: [
          { file: 'lib.ts', name: 'a', kind: 'function' },
          { file: 'lib.ts', name: 'b', kind: 'function' },
        ],
        callers: [
          caller({ file: 'x.ts', viaSymbol: 'a', symbol: 'shared' }),
          caller({ file: 'x.ts', viaSymbol: 'b', symbol: 'shared' }),
          caller({ file: 'y.ts', viaSymbol: 'b', symbol: 'own' }),
        ],
      }),
      20,
    );
    expect(res.counts.callers).toBe(2);
  });

  it('builds the three summary forms', () => {
    expect(toBlastRadius(facade({}), 20).blast.summary).toBe(
      'No indexed symbols in the changed files.',
    );
    expect(
      toBlastRadius(
        facade({ changedSymbols: [{ file: 'l.ts', name: 'a', kind: 'function' }] }),
        20,
      ).blast.summary,
    ).toBe('1 changed symbol, no downstream callers found.');
    const withCallers = toBlastRadius(
      facade({
        changedSymbols: [
          { file: 'l.ts', name: 'a', kind: 'function' },
          { file: 'l.ts', name: 'b', kind: 'function' },
        ],
        callers: [caller({ file: 'x.ts', viaSymbol: 'a' })],
        factsByFile: { 'x.ts': { endpoints: ['GET /a'], crons: [] } },
      }),
      20,
    );
    expect(withCallers.blast.summary).toBe(
      '2 changed symbols reach 1 caller, 1 endpoint and 0 cron jobs.',
    );
  });

  it('emptyBlast is a valid empty map', () => {
    const e = emptyBlast();
    expect(BlastRadius.safeParse(e.blast).success).toBe(true);
    expect(e.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(e.truncated).toBe(false);
  });
});
