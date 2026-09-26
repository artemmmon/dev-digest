import { describe, it, expect } from 'vitest';
import {
  extractIssueRefs,
  extractTicketKeys,
  extractDocRefs,
  normalizeRepoPath,
  resolveDocRef,
  isPrAddedDoc,
} from '../src/modules/intent/links.js';

const repo = { owner: 'acme', name: 'payments-api' };

describe('extractIssueRefs', () => {
  it('extracts a bare #N as same-repo', () => {
    const refs = extractIssueRefs('Closes #12.', repo);
    expect(refs).toEqual([{ number: 12, sameRepo: true, repo: undefined }]);
  });

  it('extracts owner/repo#N and flags cross-repo as not same-repo', () => {
    const refs = extractIssueRefs('See other/thing#5 and acme/payments-api#7', repo);
    expect(refs).toEqual(
      expect.arrayContaining([
        { number: 5, sameRepo: false, repo: 'other/thing' },
        { number: 7, sameRepo: true, repo: 'acme/payments-api' },
      ]),
    );
  });

  it('extracts an issue URL and dedupes against the bare form', () => {
    const refs = extractIssueRefs(
      'https://github.com/acme/payments-api/issues/9 also #9',
      repo,
    );
    // one entry from the URL (repo-qualified) + one from the bare form (unqualified) —
    // both point at the same issue but are distinct keys; both are same-repo.
    expect(refs.every((r) => r.sameRepo)).toBe(true);
    expect(refs.some((r) => r.number === 9)).toBe(true);
  });

  it('does not double-count the tail of a cross-repo ref as a bare ref', () => {
    const refs = extractIssueRefs('acme/payments-api#7', repo);
    expect(refs).toHaveLength(1);
  });
});

describe('extractTicketKeys', () => {
  it('extracts Jira/Linear-style keys and caps the count', () => {
    const text = 'PROJ-42 and ABC-1 and DEF-999999 and G-1 and H-2 and I-3';
    const keys = extractTicketKeys(text);
    expect(keys).toContain('PROJ-42');
    expect(keys.length).toBeLessThanOrEqual(5);
  });

  it('ignores lowercase or malformed keys', () => {
    expect(extractTicketKeys('proj-42 not a key')).toEqual([]);
  });
});

describe('extractDocRefs', () => {
  it('finds a markdown link, a bare path and a blob URL', () => {
    const text =
      'See [the plan](docs/plans/02-x.md), also specs/08-y.md and https://github.com/acme/payments-api/blob/main/README.md';
    const refs = extractDocRefs(text);
    expect(refs).toContain('docs/plans/02-x.md');
    expect(refs).toContain('specs/08-y.md');
    expect(refs.some((r) => r.includes('/blob/'))).toBe(true);
  });

  it('never turns the path inside a URL into a bare repo-path candidate', () => {
    const refs = extractDocRefs(
      'Design: https://notion.so/team/design.md and [spec](https://github.com/acme/payments-api/blob/main/specs/08-y.md)',
    );
    expect([...refs].sort()).toEqual([
      'https://github.com/acme/payments-api/blob/main/specs/08-y.md',
      'https://notion.so/team/design.md',
    ]);
    expect(refs).not.toContain('notion.so/team/design.md');
    expect(refs).not.toContain('specs/08-y.md');
  });

  it('ignores an external link that is not a plan/spec (e.g. a PR footer)', () => {
    const refs = extractDocRefs('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
    expect(refs).toEqual([]);
  });

  it('keeps an external link that looks like a plan/spec', () => {
    const refs = extractDocRefs(
      '[the spec](https://example.com/page) · [x](https://acme.notion.so/Rate-limits-1a2b) · [y](https://ex.com/a.md)',
    );
    expect([...refs].sort()).toEqual([
      'https://acme.notion.so/Rate-limits-1a2b',
      'https://ex.com/a.md',
      'https://example.com/page',
    ]);
  });

  it('ignores markdown images and badges', () => {
    const refs = extractDocRefs('![ci](https://img.shields.io/badge.svg) [plan](docs/plans/02-x.md)');
    expect(refs).toEqual(['docs/plans/02-x.md']);
  });

  it('stays fast on a long pathological body (bounded regexes)', () => {
    const body = '['.repeat(50_000) + 'a/'.repeat(50_000);
    const start = Date.now();
    extractDocRefs(body);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('normalizeRepoPath — fail closed (D4)', () => {
  it('accepts a plain relative doc path', () => {
    expect(normalizeRepoPath('docs/plans/02-x.md')).toBe('docs/plans/02-x.md');
  });

  it.each([
    '../secret.md',
    '/etc/passwd.md',
    'a\\b.md',
    'a%2e%2e/b.md',
    'a\0b.md',
    'x'.repeat(301) + '.md',
    'README', // no doc extension
    'image.png',
    'a//b.md',
  ])('rejects %s', (raw) => {
    expect(normalizeRepoPath(raw)).toBeNull();
  });
});

describe('resolveDocRef', () => {
  it('resolves a same-repo blob URL, ignoring the ref in the URL', () => {
    const res = resolveDocRef(
      'https://github.com/acme/payments-api/blob/some-other-branch/docs/x.md',
      repo,
    );
    expect(res.sameRepo).toBe(true);
    expect(res.path).toBe('docs/x.md');
  });

  it('marks a cross-repo blob URL as not same-repo (unreachable)', () => {
    const res = resolveDocRef('https://github.com/other/thing/blob/main/docs/x.md', repo);
    expect(res.sameRepo).toBe(false);
    expect(res.path).toBeNull();
  });

  it('matches owner/name case-insensitively', () => {
    const res = resolveDocRef('https://github.com/ACME/Payments-API/blob/main/docs/x.md', repo);
    expect(res.sameRepo).toBe(true);
    expect(res.path).toBe('docs/x.md');
  });

  it('rejects a malformed percent-escape instead of throwing', () => {
    const res = resolveDocRef('https://github.com/acme/payments-api/blob/main/docs/%E0%A4%A.md', repo);
    expect(res.path).toBeNull();
  });

  it('marks another host entirely as not same-repo', () => {
    const res = resolveDocRef('https://notion.so/some-doc', repo);
    expect(res.sameRepo).toBe(false);
    expect(res.path).toBeNull();
  });

  it('resolves a bare relative path against the current repo', () => {
    const res = resolveDocRef('docs/plans/02-x.md', repo);
    expect(res.sameRepo).toBe(true);
    expect(res.path).toBe('docs/plans/02-x.md');
  });
});

describe('isPrAddedDoc (D5)', () => {
  it('accepts specs/** and docs/plans/** doc files', () => {
    expect(isPrAddedDoc('specs/08-intent-layer.md')).toBe(true);
    expect(isPrAddedDoc('docs/plans/02-intent-layer.md')).toBe(true);
  });

  it('rejects a non-doc extension or an unrelated path', () => {
    expect(isPrAddedDoc('specs/data.json')).toBe(false);
    expect(isPrAddedDoc('src/index.ts')).toBe(false);
  });
});
