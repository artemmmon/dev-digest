import { describe, it, expect } from 'vitest';
import { dedupeCandidates, jaccard, ruleWords } from '../src/modules/conventions/dedup.js';
import type { VerifiedConvention } from '../src/modules/conventions/domain.js';

function v(rule: string, confidence = 0.7, category = 'api'): VerifiedConvention {
  return {
    category,
    rule,
    evidencePath: 'a.ts',
    evidenceLine: 1,
    evidenceEndLine: 1,
    evidenceSnippet: 'x',
    confidence,
  };
}

describe('jaccard', () => {
  it('is 1 for the same words and ignores case and punctuation', () => {
    expect(jaccard(ruleWords('Use zod, at the edge!'), ruleWords('use ZOD at the edge'))).toBe(1);
  });
  it('is 0 for disjoint sets', () => {
    expect(jaccard(ruleWords('alpha beta'), ruleWords('gamma delta'))).toBe(0);
  });
});

describe('dedupeCandidates', () => {
  it('drops a near-duplicate and keeps the higher-confidence one', () => {
    const r = dedupeCandidates(
      [
        v('Validate every request body with zod at the route edge', 0.6),
        v('Validate every request body with zod at the route edge.', 0.9),
        v('Name test files after their subject', 0.5, 'naming'),
      ],
      [],
    );
    expect(r.kept.map((c) => c.confidence)).toEqual([0.9, 0.5]);
    expect(r.dropped.duplicate).toBe(1);
  });

  it('keeps rules that only share a few words', () => {
    const r = dedupeCandidates([v('Use zod at the edge'), v('Use pino for logging at the edge of services')], []);
    expect(r.kept).toHaveLength(2);
  });

  it('never re-suggests a rule that was accepted or rejected', () => {
    const r = dedupeCandidates(
      [v('Route handlers never touch the database directly'), v('Errors are AppError subclasses')],
      ['route handlers NEVER touch the database directly.', 'something unrelated entirely here'],
    );
    expect(r.kept.map((c) => c.rule)).toEqual(['Errors are AppError subclasses']);
    expect(r.dropped.known_decision).toBe(1);
  });

  it('caps each category and the total, highest confidence first', () => {
    const many = Array.from({ length: 7 }, (_, i) => v(`api rule number ${i} about widget${i}`, 0.5 + i / 20));
    const r = dedupeCandidates(many, [], { perCategory: 4, total: 20 });
    expect(r.kept).toHaveLength(4);
    expect(r.kept[0]!.confidence).toBeCloseTo(0.8);
    expect(r.dropped.category_cap).toBe(3);

    const spread = Array.from({ length: 30 }, (_, i) =>
      v(`rule ${i} about thing${i} and stuff${i}`, 0.5, ['naming', 'api', 'types', 'imports', 'async', 'testing', 'logging', 'config'][i % 8]),
    );
    const t = dedupeCandidates(spread, [], { perCategory: 4, total: 20 });
    expect(t.kept).toHaveLength(20);
    expect(t.dropped.category_cap).toBe(10);
  });

  it('keeps the model order for equal confidence', () => {
    const r = dedupeCandidates([v('first rule about alpha', 0.7), v('second rule about beta', 0.7)], []);
    expect(r.kept.map((c) => c.rule)).toEqual(['first rule about alpha', 'second rule about beta']);
  });
});
