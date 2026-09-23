import { describe, it, expect } from 'vitest';
import { buildSkillDraft, evidenceFilesOf } from '../src/modules/conventions/skill-body.js';
import { githubBlobUrl } from '../src/modules/conventions/helpers.js';

const rules = [
  {
    category: 'testing',
    rule: 'Tests sit next to their subject.',
    evidencePath: 'server/test/a.test.ts',
    evidenceLine: 3,
    evidenceSnippet: "describe('a', () => {\n  it('works', () => {});\n});",
    confidence: 0.6,
  },
  {
    category: 'naming',
    rule: 'Files are kebab-case.',
    evidencePath: 'server/src/user-service.ts',
    evidenceLine: 1,
    evidenceSnippet: 'export class UserService {}',
    confidence: 0.9,
  },
  {
    category: 'naming',
    rule: 'Classes end with their role.',
    evidencePath: 'server/src/user-service.ts',
    evidenceLine: 1,
    evidenceSnippet: 'export class UserService {}',
    confidence: 0.7,
  },
];

describe('buildSkillDraft', () => {
  const draft = buildSkillDraft('acme/api', rules);

  it('names the skill and types it as a convention', () => {
    expect(draft.name).toBe('repo-conventions');
    expect(draft.type).toBe('convention');
  });

  it('has a directive description with a when-not clause, within 500 chars', () => {
    expect(draft.description.length).toBeLessThanOrEqual(500);
    expect(draft.description).toMatch(/^Use when/);
    expect(draft.description).toMatch(/Do NOT apply to generated or vendored/);
    expect(draft.description).toContain('acme/api');
  });

  it('starts with the repo heading and a how-to-apply section', () => {
    expect(draft.body.startsWith('# Conventions — acme/api\n')).toBe(true);
    expect(draft.body).toContain('## How to apply');
  });

  it('groups by category in a fixed order, best rule first', () => {
    const naming = draft.body.indexOf('## Naming');
    const testing = draft.body.indexOf('## Testing');
    expect(naming).toBeGreaterThan(-1);
    expect(testing).toBeGreaterThan(naming);
    expect(draft.body.indexOf('Files are kebab-case.')).toBeLessThan(draft.body.indexOf('Classes end with'));
  });

  it('lists evidence and a fenced snippet for every rule', () => {
    expect(draft.body).toContain('Evidence: `server/src/user-service.ts:1`');
    expect(draft.body).toContain('```ts\n  export class UserService {}\n  ```');
    expect(draft.body).toContain("  describe('a', () => {\n    it('works', () => {});\n  });");
  });

  it('lists each evidence file once, sorted', () => {
    expect(draft.evidence_files).toEqual(['server/src/user-service.ts', 'server/test/a.test.ts']);
    expect(evidenceFilesOf(rules)).toEqual(draft.evidence_files);
  });

  it('caps a snippet at 6 lines and survives backticks inside it', () => {
    const long = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');
    const d = buildSkillDraft('a/b', [
      { ...rules[1]!, evidenceSnippet: long },
      { ...rules[0]!, evidenceSnippet: 'const s = ```x```;' },
    ]);
    expect(d.body).toContain('line5');
    expect(d.body).not.toContain('line6');
    expect(d.body).toContain('````');
  });

  it('truncates an oversized description', () => {
    const d = buildSkillDraft(`${'o'.repeat(300)}/${'n'.repeat(300)}`, rules);
    expect(d.description.length).toBeLessThanOrEqual(500);
  });
});

describe('githubBlobUrl', () => {
  it('links a single line', () => {
    expect(githubBlobUrl('o', 'n', 'abc123', 'src/a.ts', 10)).toBe(
      'https://github.com/o/n/blob/abc123/src/a.ts#L10',
    );
  });
  it('links a range', () => {
    expect(githubBlobUrl('o', 'n', 'abc123', 'src/a.ts', 10, 14)).toBe(
      'https://github.com/o/n/blob/abc123/src/a.ts#L10-L14',
    );
  });
  it('does not make a range when end <= start', () => {
    expect(githubBlobUrl('o', 'n', 'abc', 'a.ts', 10, 10)).toBe('https://github.com/o/n/blob/abc/a.ts#L10');
  });
  it('encodes each path segment but keeps the slashes', () => {
    expect(githubBlobUrl('o', 'n', 'abc', 'lib/my dir/a#b.dart', 1)).toBe(
      'https://github.com/o/n/blob/abc/lib/my%20dir/a%23b.dart#L1',
    );
  });
});
