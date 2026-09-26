import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopePolicy } from '../src/scope.js';

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'something',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
    ...over,
  } as Finding;
}

describe('applyScopePolicy — no filter', () => {
  it('is the identity transform when scopeFilter is undefined', () => {
    const findings = [finding({ scope: 'out_of_scope', severity: 'CRITICAL' })];
    const result = applyScopePolicy(findings, undefined);
    expect(result.kept).toBe(findings);
    expect(result.dropped).toEqual([]);
  });
});

describe('applyScopePolicy — in-scope and untagged', () => {
  it('leaves in-scope findings untouched', () => {
    const findings = [
      finding({ id: 'a', scope: 'in_scope' }),
      finding({ id: 'b' }), // untagged counts as in-scope
    ];
    const result = applyScopePolicy(findings, { minSignalSeverity: 'WARNING' });
    expect(result.kept).toEqual(findings);
    expect(result.dropped).toEqual([]);
  });
});

describe('applyScopePolicy — minor out-of-scope (below threshold)', () => {
  it('drops a SUGGESTION below the WARNING threshold, logged with reason out_of_scope', () => {
    const suggestion = finding({ id: 'sug', severity: 'SUGGESTION', scope: 'out_of_scope' });
    const inScope = finding({ id: 'in', scope: 'in_scope' });
    const result = applyScopePolicy([inScope, suggestion], { minSignalSeverity: 'WARNING' });
    expect(result.kept).toEqual([inScope]);
    expect(result.dropped).toEqual([{ finding: suggestion, reason: 'out_of_scope' }]);
    expect(result.droppedMinor).toBe(1);
    expect(result.foldedSerious).toBe(0);
  });
});

describe('applyScopePolicy — serious out-of-scope (at/above threshold)', () => {
  it('folds two WARNING+ out-of-scope findings into one signal, max severity, both listed, anchored at the top one', () => {
    const warn = finding({
      id: 'w1',
      severity: 'WARNING',
      scope: 'out_of_scope',
      file: 'b.ts',
      start_line: 20,
      title: 'warn finding',
      confidence: 0.7,
    });
    const critical = finding({
      id: 'c1',
      severity: 'CRITICAL',
      scope: 'out_of_scope',
      file: 'a.ts',
      start_line: 5,
      title: 'critical finding',
      confidence: 0.95,
    });
    const inScope = finding({ id: 'keep', scope: 'in_scope' });
    const result = applyScopePolicy([inScope, warn, critical], { minSignalSeverity: 'WARNING' });

    expect(result.foldedSerious).toBe(2);
    expect(result.droppedMinor).toBe(0);
    expect(result.dropped).toEqual([]);
    expect(result.kept).toHaveLength(2); // inScope + one signal
    expect(result.kept).toContainEqual(inScope);

    const signal = result.kept.find((f) => f.kind === 'out_of_scope')!;
    expect(signal.severity).toBe('CRITICAL'); // max of the folded
    expect(signal.file).toBe('a.ts'); // anchored at the top (highest severity) finding
    expect(signal.start_line).toBe(5);
    expect(signal.title).toContain('Serious issue outside this PR\'s stated scope (2)');
    expect(signal.rationale).toContain('critical finding');
    expect(signal.rationale).toContain('warn finding');
    expect(signal.scope).toBe('out_of_scope');
  });

  it('drops minor AND folds serious in the same run', () => {
    const suggestion = finding({ id: 's', severity: 'SUGGESTION', scope: 'out_of_scope' });
    const warn1 = finding({ id: 'w1', severity: 'WARNING', scope: 'out_of_scope', file: 'a.ts' });
    const warn2 = finding({ id: 'w2', severity: 'WARNING', scope: 'out_of_scope', file: 'b.ts' });
    const result = applyScopePolicy([suggestion, warn1, warn2], { minSignalSeverity: 'WARNING' });
    expect(result.droppedMinor).toBe(1);
    expect(result.foldedSerious).toBe(2);
    expect(result.kept).toHaveLength(1); // only the folded signal (no other in-scope findings)
  });
});

describe('applyScopePolicy — incidental hunk ranges (deterministic)', () => {
  const ranges = [{ path: 'lib/api.dart', start_line: 10, end_line: 20 }];

  it('treats a finding inside an incidental hunk as out of scope even when tagged in_scope', () => {
    const findings = [
      finding({ id: 'in', file: 'server/auth.dart', start_line: 5, end_line: 5, scope: 'in_scope' }),
      finding({ id: 'x', file: 'lib/api.dart', start_line: 18, end_line: 22, severity: 'CRITICAL', scope: 'in_scope' }),
      finding({ id: 'y', file: 'lib/api.dart', start_line: 12, end_line: 12, severity: 'SUGGESTION' }),
    ];
    const result = applyScopePolicy(findings, { minSignalSeverity: 'WARNING', outOfScopeRanges: ranges });
    expect(result.kept.map((f) => f.id)).toEqual(['in', 'out-of-scope-x']);
    expect(result.foldedSerious).toBe(1);
    expect(result.droppedMinor).toBe(1);
  });

  it('leaves a finding outside every range (or in another file) alone', () => {
    const findings = [
      finding({ id: 'a', file: 'lib/api.dart', start_line: 21, end_line: 25 }),
      finding({ id: 'b', file: 'lib/other.dart', start_line: 12, end_line: 12 }),
    ];
    const result = applyScopePolicy(findings, { minSignalSeverity: 'WARNING', outOfScopeRanges: ranges });
    expect(result.kept).toEqual(findings);
  });
});
