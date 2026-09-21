import { describe, it, expect } from 'vitest';
import { normalizeEvidencePath, verifyCandidates } from '../src/modules/conventions/verify.js';
import type { RawConvention } from '../src/modules/conventions/domain.js';

const FILE = [
  "import { z } from 'zod';",
  '',
  'export async function handler(req) {',
  '  const body = Body.parse(req.body);',
  '  return service.create(body);',
  '}',
  '',
  'export async function other(req) {',
  '  const body = Body.parse(req.body);',
  '  return service.update(body);',
  '}',
].join('\n');

const files = new Map([['src/routes.ts', FILE]]);

function cand(over: Partial<RawConvention['evidence']> = {}, rest: Partial<RawConvention> = {}): RawConvention {
  return {
    category: 'api',
    rule: 'Validate request bodies with zod at the edge.',
    evidence: { file: 'src/routes.ts', line: 4, snippet: 'const body = Body.parse(req.body);', ...over },
    confidence: 0.8,
    ...rest,
  };
}

describe('normalizeEvidencePath', () => {
  it.each([
    ['src/a.ts', 'src/a.ts'],
    ['./src/a.ts', 'src/a.ts'],
    ['/src/a.ts', 'src/a.ts'],
    ['`src/a.ts`', 'src/a.ts'],
    ['  src/a.ts:12 ', 'src/a.ts'],
    ['src/a.ts:12-14', 'src/a.ts'],
    ['src/a.ts#L12-L14', 'src/a.ts'],
    ['.\\src\\a.ts', 'src/a.ts'],
  ])('%s -> %s', (raw, want) => {
    expect(normalizeEvidencePath(raw)).toBe(want);
  });
});

describe('verifyCandidates', () => {
  it('keeps an exact snippet at the claimed line', () => {
    const r = verifyCandidates([cand()], files);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]).toMatchObject({
      evidencePath: 'src/routes.ts',
      evidenceLine: 4,
      evidenceEndLine: 4,
      category: 'api',
      confidence: 0.8,
    });
    expect(r.lineCorrected).toBe(0);
  });

  it('matches whitespace-tolerantly and stores the FILE text, not the model text', () => {
    const r = verifyCandidates(
      [cand({ snippet: '   const   body =\tBody.parse(req.body);  ', line: 4 })],
      files,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.evidenceSnippet).toBe('  const body = Body.parse(req.body);');
  });

  it('matches a multi-line snippet with different indentation and stores every file line', () => {
    const r = verifyCandidates(
      [cand({ line: 3, snippet: 'export async function handler(req) {\nconst body = Body.parse(req.body);\nreturn service.create(body);' })],
      files,
    );
    expect(r.kept[0]).toMatchObject({ evidenceLine: 3, evidenceEndLine: 5 });
    expect(r.kept[0]!.evidenceSnippet).toBe(FILE.split('\n').slice(2, 5).join('\n'));
  });

  it('tolerates omitted blank lines inside the snippet', () => {
    const r = verifyCandidates(
      [cand({ line: 6, snippet: '}\nexport async function other(req) {' })],
      files,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]).toMatchObject({ evidenceLine: 6, evidenceEndLine: 8 });
  });

  it('corrects the line to the nearest real match and counts it', () => {
    // the statement is on lines 4 and 9; the model says 10 -> 9
    const r = verifyCandidates([cand({ line: 10 })], files);
    expect(r.kept[0]!.evidenceLine).toBe(9);
    expect(r.lineCorrected).toBe(1);
    const r2 = verifyCandidates([cand({ line: 1 })], files);
    expect(r2.kept[0]!.evidenceLine).toBe(4);
  });

  it('strips a copied line-number gutter', () => {
    const r = verifyCandidates([cand({ snippet: ' 4|   const body = Body.parse(req.body);\n 5|   return service.create(body);' })], files);
    expect(r.kept[0]).toMatchObject({ evidenceLine: 4, evidenceEndLine: 5 });
  });

  it('drops a file that was not shown and counts it', () => {
    const r = verifyCandidates([cand({ file: 'src/other.ts' }), cand({ file: 'src/invented.ts' })], files);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped.unknown_file).toBe(2);
  });

  it('normalises a ./ path and a :line suffix', () => {
    const r = verifyCandidates([cand({ file: './src/routes.ts:4' })], files);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.evidencePath).toBe('src/routes.ts');
  });

  it('drops a snippet that is not in the file', () => {
    const r = verifyCandidates([cand({ snippet: 'const body = Schema.safeParse(req.body);' })], files);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped.snippet_not_found).toBe(1);
  });

  it('drops an empty snippet and a trivial one (< 8 non-space chars)', () => {
    const r = verifyCandidates([cand({ snippet: '' }), cand({ snippet: '  }  ' }), cand({ snippet: 'a b c' })], files);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped.trivial_snippet).toBe(3);
  });

  it('handles CRLF files and stores them without the carriage returns', () => {
    const crlf = new Map([['src/routes.ts', FILE.replace(/\n/g, '\r\n')]]);
    const r = verifyCandidates([cand({ line: 4 })], crlf);
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0]!.evidenceSnippet).toBe('  const body = Body.parse(req.body);');
    expect(r.kept[0]!.evidenceSnippet).not.toContain('\r');
  });

  it('caps the stored evidence at 12 lines', () => {
    const long = Array.from({ length: 30 }, (_, i) => `const value${i} = compute(${i});`).join('\n');
    const r = verifyCandidates(
      [cand({ file: 'a.ts', line: 1, snippet: long })],
      new Map([['a.ts', long]]),
    );
    expect(r.kept[0]).toMatchObject({ evidenceLine: 1, evidenceEndLine: 12 });
    expect(r.kept[0]!.evidenceSnippet.split('\n')).toHaveLength(12);
  });

  it('maps an unknown category to other and clamps confidence', () => {
    const r = verifyCandidates(
      [
        cand({}, { category: 'vibes', confidence: 1.7 }),
        cand({}, { category: 'api', confidence: -3 }),
        cand({}, { category: 'api', confidence: 85 }),
        cand({}, { category: 'api', confidence: Number.NaN }),
      ],
      files,
    );
    expect(r.kept.map((k) => k.category)).toEqual(['other', 'api', 'api', 'api']);
    expect(r.kept.map((k) => k.confidence)).toEqual([1, 0, 0.85, 0.5]);
  });

  it('skips a candidate with an empty rule', () => {
    const r = verifyCandidates([cand({}, { rule: '   ' })], files);
    expect(r.kept).toHaveLength(0);
  });
});
