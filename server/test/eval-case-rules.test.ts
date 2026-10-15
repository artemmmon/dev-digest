import { describe, expect, it } from 'vitest';
import { EvalCaseSave } from '@devdigest/shared';
import {
  appliedSkills,
  checkCaseSave,
  fileRanges,
  hasHunk,
  isExcludedFile,
  normalizeCaseDiff,
  prepareCaseDiff,
} from '../src/modules/eval/case-rules.js';
import { EXCLUDED_FILE_MESSAGE } from '../src/modules/eval/constants.js';
import { diffFor } from './helpers/eval.js';

/**
 * SPEC-13 case rules (AC-11, AC-21, AC-63, AC-64) — pure: the contract's field rules, the diff
 * normaliser, the range check against the case diff and the excluded-file rule.
 */

const save = (over: Record<string, unknown> = {}) => ({
  name: 'must-find-sql-injection',
  input_diff: diffFor('src/db.ts'),
  input_meta: { pr_title: 'Add query', pr_body: '' },
  expected_output: { type: 'must_find', file: 'src/db.ts', start_line: 10, end_line: 12 },
  ...over,
});

const issuesOf = (value: unknown) => {
  const parsed = EvalCaseSave.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'));
};

describe('EvalCaseSave field rules — AC-11', () => {
  it('AC-11: a valid save parses', () => {
    expect(EvalCaseSave.safeParse(save()).success).toBe(true);
  });

  it('AC-11: a name outside 1–120 characters is rejected on `name`', () => {
    expect(issuesOf(save({ name: '' }))).toContain('name');
    expect(issuesOf(save({ name: '   ' }))).toContain('name'); // trimmed to empty
    expect(issuesOf(save({ name: 'x'.repeat(121) }))).toContain('name');
    expect(issuesOf(save({ name: 'x'.repeat(120) }))).toEqual([]);
    expect(issuesOf(save({ name: 'x' }))).toEqual([]);
  });

  it('AC-11: a diff over 100 000 characters is rejected on `input_diff`; exactly 100 000 passes', () => {
    expect(issuesOf(save({ input_diff: 'x'.repeat(100_001) }))).toContain('input_diff');
    expect(issuesOf(save({ input_diff: 'x'.repeat(100_000) }))).toEqual([]);
  });

  it('AC-11: start_line greater than end_line is rejected and names `expected_output.end_line`', () => {
    const issues = issuesOf(
      save({ expected_output: { type: 'must_find', file: 'src/db.ts', start_line: 12, end_line: 10 } }),
    );
    expect(issues).toContain('expected_output.end_line');
  });
});

describe('checkCaseSave — AC-11, AC-63, AC-64', () => {
  it('AC-11: a diff with no unified-diff hunk is a violation on `input_diff`', () => {
    const v = checkCaseSave(EvalCaseSave.parse(save({ input_diff: 'just some pasted text\nwithout hunks' })));
    expect(v).toMatchObject({ path: ['input_diff'] });
  });

  it('AC-11: a range that intersects no hunk of the expectation file is a violation naming the range', () => {
    const v = checkCaseSave(
      EvalCaseSave.parse(
        save({ expected_output: { type: 'must_find', file: 'src/db.ts', start_line: 40, end_line: 50 } }),
      ),
    );
    expect(v).toMatchObject({ path: ['expected_output', 'start_line'] });
  });

  it('AC-11: an expectation on a file the diff does not touch is a violation', () => {
    const v = checkCaseSave(
      EvalCaseSave.parse(
        save({ expected_output: { type: 'must_find', file: 'src/other.ts', start_line: 10, end_line: 12 } }),
      ),
    );
    expect(v).toMatchObject({ path: ['expected_output', 'start_line'] });
  });

  it('AC-11: a range whose bound touches the hunk new-side range (10-13) is accepted', () => {
    const touching = (start: number, end: number) =>
      checkCaseSave(
        EvalCaseSave.parse(
          save({ expected_output: { type: 'must_find', file: 'src/db.ts', start_line: start, end_line: end } }),
        ),
      );
    expect(touching(13, 20)).toBeNull();
    expect(touching(1, 10)).toBeNull();
    expect(touching(14, 20)).not.toBeNull();
    expect(touching(1, 9)).not.toBeNull();
  });

  it('AC-63, EC-20: a seeded case on an excluded file is rejected with the fixed message', () => {
    const v = checkCaseSave(
      EvalCaseSave.parse(
        save({
          input_diff: diffFor('package-lock.json'),
          expected_output: { type: 'must_find', file: 'package-lock.json', start_line: 10, end_line: 12 },
          source_finding_id: '3f2b8c0e-5f0e-4b7a-9d0a-0c2a8f6f1b11',
        }),
      ),
    );
    expect(v).toEqual({
      path: ['expected_output', 'file'],
      message: 'This file is excluded from review and can never pass preparation',
    });
    expect(v?.message).toBe(EXCLUDED_FILE_MESSAGE);
  });

  it('AC-64, EC-20: a hand-written case on a generated or fixture file gets the same rejection', () => {
    for (const file of [
      'server/pnpm-lock.yaml',
      'yarn.lock',
      'client/docs/design/app.jsx',
      'server/src/db/migrations/0001_x.sql',
    ]) {
      const v = checkCaseSave(
        EvalCaseSave.parse(
          save({
            input_diff: diffFor(file),
            expected_output: { type: 'must_not_flag', file, start_line: 10, end_line: 12 },
          }),
        ),
      );
      expect(v, file).toMatchObject({ message: EXCLUDED_FILE_MESSAGE });
    }
    expect(isExcludedFile('src/db.ts')).toBe(false);
  });
});

describe('normalizeCaseDiff and fileRanges — AC-11, AC-21', () => {
  it('AC-21: a diff headed only by ---/+++ gets a `diff --git` line so the raw filter sees one file per section', () => {
    const out = normalizeCaseDiff(diffFor('src/db.ts'));
    expect(out.split('\n')[0]).toBe('diff --git a/src/db.ts b/src/db.ts');
    expect(out).toContain('--- a/src/db.ts');
  });

  it('AC-21: normalising is idempotent and leaves a diff that already has headers alone', () => {
    const once = normalizeCaseDiff(diffFor('src/db.ts'));
    expect(normalizeCaseDiff(once)).toBe(once);
    const headed = `diff --git a/x.ts b/x.ts\n${diffFor('x.ts')}`;
    expect(normalizeCaseDiff(headed)).toBe(headed);
  });

  it('AC-11: fileRanges maps each file of a multi-file diff to its new-side hunk ranges', () => {
    const raw = diffFor('src/a.ts') + diffFor('src/b.ts').replace('+10,4', '+30,4');
    const ranges = fileRanges(raw);
    expect([...ranges.keys()]).toEqual(['src/a.ts', 'src/b.ts']);
    expect(ranges.get('src/a.ts')).toEqual([{ start: 10, end: 13 }]);
    expect(ranges.get('src/b.ts')).toEqual([{ start: 30, end: 33 }]);
  });

  it('AC-11: hasHunk is false for text without an @@ header', () => {
    expect(hasHunk('--- a/x\n+++ b/x\n+line')).toBe(false);
    expect(hasHunk(diffFor('x.ts'))).toBe(true);
  });
});

describe('prepareCaseDiff and appliedSkills — AC-21', () => {
  it('AC-21: generated and fixture files are removed from the diff the engine sees', () => {
    const raw = diffFor('src/db.ts') + diffFor('package-lock.json');
    const { diff, paths } = prepareCaseDiff(raw);
    expect(paths).toEqual(['src/db.ts']);
    expect(diff.files.map((f) => f.path)).toEqual(['src/db.ts']);
  });

  it('AC-21: a case whose only file is excluded leaves nothing to review', () => {
    expect(prepareCaseDiff(diffFor('yarn.lock')).paths).toEqual([]);
  });

  it('AC-21: skills are filtered by their applies_to globs against the case files, in binding order', () => {
    const skills = [
      { id: 's1', appliesTo: ['*.dart'] },
      { id: 's2', appliesTo: null },
      { id: 's3', appliesTo: ['src/**'] },
    ];
    expect(appliedSkills(skills, ['src/db.ts']).map((s) => s.id)).toEqual(['s2', 's3']);
    expect(appliedSkills(skills, ['lib/main.dart']).map((s) => s.id)).toEqual(['s1', 's2']);
  });
});
