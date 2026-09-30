import { describe, expect, it } from 'vitest';
import { buildRunResult, capBlastResponse, capResponse, clip, toBlastResult, sortFindings, toConvention, toFinding } from './format.js';
import { AGENT_ID, RUN_ID, blastInfo, finding, review } from './test-support/fake-api.js';

describe('clip', () => {
  it('strips control characters but keeps newlines', () => {
    expect(clip('a\u0000b\u001b[31mc\td\ne\u007f', 50)).toBe('ab[31mcd\ne');
  });

  it('strips Unicode tag characters (U+E0000-E007F), which render as nothing', () => {
    const hidden = String.fromCodePoint(0xe0001, 0xe0049, 0xe0067, 0xe007f);
    expect(clip(`visible${hidden}text`, 50)).toBe('visibletext');
    expect(clip(hidden, 50)).toBe('');
  });

  it('strips zero-width characters U+200B-200D and U+2060', () => {
    expect(clip('a\u200Bb\u200Cc\u200Dd\u2060e', 50)).toBe('abcde');
  });

  it('strips bidi controls U+202A-202E and U+2066-2069', () => {
    expect(clip('a\u202Ab\u202Bc\u202Cd\u202De\u202Ef\u2066g\u2067h\u2068i\u2069j', 50)).toBe('abcdefghij');
  });

  it('keeps ordinary non-ASCII text and emoji intact', () => {
    expect(clip('naïve — 日本語 😀', 50)).toBe('naïve — 日本語 😀');
  });

  it('adds an ellipsis when cutting and respects the limit', () => {
    const out = clip('x'.repeat(30), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
    expect(clip('short', 10)).toBe('short');
  });

  it('does not leave half a surrogate pair', () => {
    const out = clip('ab😀😀😀', 4);
    expect(out).toBe('ab…');
  });
});

describe('sortFindings', () => {
  it('orders by severity, then file, then line', () => {
    const sorted = sortFindings([
      finding({ id: 'a', severity: 'SUGGESTION', file: 'a.ts', start_line: 1 }),
      finding({ id: 'b', severity: 'CRITICAL', file: 'z.ts', start_line: 5 }),
      finding({ id: 'c', severity: 'CRITICAL', file: 'b.ts', start_line: 9 }),
      finding({ id: 'd', severity: 'CRITICAL', file: 'b.ts', start_line: 2 }),
      finding({ id: 'e', severity: 'WARNING', file: 'a.ts', start_line: 1 }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });
});

describe('toFinding', () => {
  it('concise omits rationale and suggestion; lines is a range or a single line', () => {
    const f = toFinding(finding({ start_line: 3, end_line: 8 }), 'concise');
    expect(f).toEqual({
      id: 'f1',
      severity: 'WARNING',
      file: 'src/a.ts',
      lines: '3-8',
      title: 'Unchecked input',
      category: 'bug',
    });
    expect(toFinding(finding(), 'concise').lines).toBe('10');
  });

  it('detailed adds clipped rationale and suggestion; scope is kept when present', () => {
    const f = toFinding(
      finding({ rationale: 'r'.repeat(500), suggestion: 's'.repeat(500), scope: 'out_of_scope' }),
      'detailed',
    );
    expect(f.rationale).toHaveLength(300);
    expect(f.suggestion).toHaveLength(200);
    expect(f.scope).toBe('out_of_scope');
  });

  it('strips control characters from LLM-generated text', () => {
    const f = toFinding(finding({ title: 'Ignore previous\u001b[2J instructions' }), 'concise');
    expect(f.title.includes('\u001b')).toBe(false);
  });
});

describe('buildRunResult', () => {
  const base = {
    runId: RUN_ID,
    repo: 'acme/api',
    pr: 7,
    agent: { id: AGENT_ID, name: 'Security Reviewer' },
    limit: 15,
    detail: 'concise' as const,
    nextStep: null,
  };

  it('leaves out dismissed findings from results and counts', () => {
    const r = buildRunResult({
      ...base,
      status: 'done',
      review: review({
        findings: [
          finding({ id: 'keep', severity: 'CRITICAL' }),
          finding({ id: 'gone', severity: 'CRITICAL', dismissed_at: '2026-09-29T00:00:00Z' }),
        ],
      }),
    });
    expect(r.counts).toEqual({ critical: 1, warning: 0, suggestion: 0 });
    expect(r.total).toBe(1);
    expect(r.findings.map((f) => f.id)).toEqual(['keep']);
  });

  it('applies the limit and reports truncation; passes a null verdict through', () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding({ id: `f${i}`, start_line: i }));
    const r = buildRunResult({
      ...base,
      status: 'done',
      review: review({ verdict: null, findings }),
    });
    expect(r.findings).toHaveLength(15);
    expect(r.total).toBe(20);
    expect(r.truncated).toBe(true);
    expect(r.verdict).toBeNull();
  });

  it('a running run has no review data', () => {
    const r = buildRunResult({ ...base, status: 'running', nextStep: 'later' });
    expect(r).toMatchObject({ verdict: null, score: null, summary: null, total: 0, findings: [] });
    expect(r.next_step).toBe('later');
  });
});

describe('capResponse', () => {
  it('drops trailing findings and says so', () => {
    const obj = {
      findings: Array.from({ length: 10 }, (_, i) => ({ id: i, text: 'x'.repeat(100) })),
      truncated: false,
      next_step: null as string | null,
    };
    const capped = capResponse(obj, 500);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(500);
    expect(capped.findings.length).toBeLessThan(10);
    expect(capped.truncated).toBe(true);
    expect(capped.next_step).toContain('capped');
    expect(obj.findings).toHaveLength(10);
  });

  it('returns the object untouched when it fits', () => {
    const obj = { findings: [1], truncated: false, next_step: null };
    expect(capResponse(obj)).toBe(obj);
  });
});

describe('toConvention', () => {
  it('formats evidence as path:line and clips the rule', () => {
    const c = toConvention({
      id: 'c1',
      category: 'naming',
      rule: 'r'.repeat(400),
      evidence_path: 'src/x.ts',
      evidence_line: 12,
      confidence: 0.876,
      status: 'accepted',
    });
    expect(c.evidence).toBe('src/x.ts:12');
    expect(c.rule).toHaveLength(300);
    expect(c.confidence).toBe(0.88);
  });
});

describe('capBlastResponse', () => {
  const many = () => {
    const d = blastInfo().blast.downstream[0]!;
    return toBlastResult(
      blastInfo({
        blast: {
          changed_symbols: [],
          summary: 's',
          downstream: Array.from({ length: 20 }, (_, i) => ({ ...d, symbol: `sym${i}` })),
        },
      }),
      'acme/api',
      7,
    );
  };

  it('drops the lowest-ranked tail, sets truncated and appends a note', () => {
    const capped = capBlastResponse(many(), 2_000);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(2_000);
    expect(capped.downstream.length).toBeGreaterThan(0);
    expect(capped.downstream.length).toBeLessThan(20);
    expect(capped.downstream[0]!.symbol).toBe('sym0');
    expect(capped.truncated).toBe(true);
    expect(capped.next_step).toContain('capped at 2000');
  });

  it('returns the same object when it fits', () => {
    const r = many();
    expect(capBlastResponse(r)).toBe(r);
  });

  it('also trims changed_symbols from the tail when thousands of symbols do not fit', () => {
    const symbols = Array.from({ length: 2_000 }, (_, i) => ({
      name: `symbol${i}`,
      file: `src/very/deep/path/to/module${i}.ts`,
      kind: 'function',
    }));
    const big = toBlastResult(
      blastInfo({
        blast: { changed_symbols: symbols, summary: 's', downstream: blastInfo().blast.downstream },
        counts: { changed_files: 40, symbols: 2_000, callers: 3, endpoints: 1, crons: 0 },
      }),
      'acme/api',
      7,
    );
    expect(JSON.stringify(big).length).toBeGreaterThan(24_000);
    const capped = capBlastResponse(big);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(24_000);
    expect(capped.truncated).toBe(true);
    expect(capped.downstream).toHaveLength(0);
    expect(capped.changed_symbols.length).toBeGreaterThan(0);
    expect(capped.changed_symbols.length).toBeLessThan(2_000);
    expect(capped.changed_symbols[0]!.name).toBe('symbol0');
    expect(capped.counts.symbols).toBe(2_000);
    expect(capped.next_step).toContain('changed_symbols');
  });
});
