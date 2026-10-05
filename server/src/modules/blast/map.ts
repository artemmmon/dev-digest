import { BlastDegradedReason } from '@devdigest/shared';
import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastFacadeResult, BlastIndexSnapshot } from './ports.js';

/**
 * Pure mapping for the blast route (application ring): index state -> reason,
 * and the facade's flat caller list -> the grouped `BlastRadius`. No I/O.
 */

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

export interface BlastMapped {
  blast: BlastRadius;
  counts: BlastCounts;
  /** True when at least one symbol's callers were cut, by the facade or at `maxPerSymbol`. */
  truncated: boolean;
}

/** A reason string from the index / facade if it is a known `BlastDegradedReason`, else `no_data`. */
export function toDegradedReason(raw: string | undefined): BlastDegradedReason {
  const parsed = BlastDegradedReason.safeParse(raw);
  return parsed.success ? parsed.data : 'no_data';
}

/** Why the map is (or may be) incomplete; `null` = a full, current index. */
export function blastReason(
  enabled: boolean,
  state: BlastIndexSnapshot,
): BlastDegradedReason | null {
  if (!enabled) return 'flag_off';
  switch (state.status) {
    case 'full':
      return null;
    case 'partial':
      return 'index_partial';
    case 'failed':
      return 'index_failed';
    case 'degraded':
      return toDegradedReason(state.degradedReason);
  }
}

/** The facade is worth calling only on a usable index (its fallback parses the clone). */
export function shouldQueryFacade(reason: BlastDegradedReason | null, fileCount: number): boolean {
  return fileCount > 0 && (reason === null || reason === 'index_partial');
}

export function emptyBlast(): BlastMapped {
  return {
    blast: { changed_symbols: [], downstream: [], summary: summarize(0, 0, 0, 0, 0) },
    counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    truncated: false,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function summarize(
  symbols: number,
  withCallers: number,
  callers: number,
  endpoints: number,
  crons: number,
): string {
  if (symbols === 0) return 'No indexed symbols in the changed files.';
  const changed = plural(symbols, 'changed symbol', 'changed symbols');
  if (withCallers === 0) return `${changed}, no downstream callers found.`;
  return (
    `${changed} ${symbols === 1 ? 'reaches' : 'reach'} ${plural(callers, 'caller', 'callers')}, ` +
    `${plural(endpoints, 'endpoint', 'endpoints')} and ${plural(crons, 'cron job', 'cron jobs')}.`
  );
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function toBlastRadius(result: BlastFacadeResult, maxPerSymbol: number): BlastMapped {
  const seenSymbol = new Set<string>();
  const changed_symbols = result.changedSymbols.filter((s) => {
    const key = `${s.name}\u0000${s.file}`;
    if (seenSymbol.has(key)) return false;
    seenSymbol.add(key);
    return true;
  });

  const groups = new Map<string, BlastFacadeResult['callers']>();
  for (const c of result.callers) {
    const g = groups.get(c.viaSymbol);
    if (g) g.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  // The facade cuts each group at its own cap before we see it, so honour its flag too.
  let truncated = result.truncated === true;
  const ranked: { bestRank: number; impact: DownstreamImpact }[] = [];
  for (const [symbol, group] of groups) {
    group.sort((a, b) => b.rank - a.rank || byString(a.file, b.file) || a.line - b.line);
    const seen = new Set<string>();
    const unique = group.filter((c) => {
      const key = `${c.file}\u0000${c.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length > maxPerSymbol) truncated = true;
    const kept = unique.slice(0, maxPerSymbol);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of kept) {
      const facts = result.factsByFile?.[c.file];
      for (const e of facts?.endpoints ?? []) endpoints.add(e);
      for (const k of facts?.crons ?? []) crons.add(k);
    }
    ranked.push({
      bestRank: kept[0]?.rank ?? 0,
      impact: {
        symbol,
        callers: kept.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
        endpoints_affected: [...endpoints].sort(byString),
        crons_affected: [...crons].sort(byString),
      },
    });
  }
  ranked.sort(
    (a, b) =>
      b.bestRank - a.bestRank ||
      b.impact.callers.length - a.impact.callers.length ||
      byString(a.impact.symbol, b.impact.symbol),
  );
  const downstream = ranked.map((r) => r.impact);

  const callerKeys = new Set<string>();
  const endpointSet = new Set<string>();
  const cronSet = new Set<string>();
  for (const d of downstream) {
    for (const c of d.callers) callerKeys.add(`${c.file}\u0000${c.name}`);
    for (const e of d.endpoints_affected) endpointSet.add(e);
    for (const k of d.crons_affected) cronSet.add(k);
  }
  const counts: BlastCounts = {
    symbols: changed_symbols.length,
    callers: callerKeys.size,
    endpoints: endpointSet.size,
    crons: cronSet.size,
  };

  return {
    blast: {
      changed_symbols,
      downstream,
      summary: summarize(
        counts.symbols,
        downstream.length,
        counts.callers,
        counts.endpoints,
        counts.crons,
      ),
    },
    counts,
    truncated,
  };
}
