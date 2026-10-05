/**
 * Issue-reference extraction shared by the intent and brief modules. Pulls
 * candidate issue refs out of untrusted PR text. Every regex is bounded and
 * anchored (no nested quantifiers) — no ReDoS. Nothing here fetches anything.
 */

export interface RepoRefLike {
  owner: string;
  name: string;
}

const CROSS_REPO_ISSUE_REF = /\b([\w.-]+)\/([\w.-]+)#(\d{1,9})\b/g;
const ISSUE_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d{1,9})\b/g;
// A bare "#12" not immediately preceded by a word char or `/` — so it doesn't
// re-match the tail of "acme/repo#12" (already caught by CROSS_REPO_ISSUE_REF).
const BARE_ISSUE_REF = /(^|[^\w/])#(\d{1,9})\b/g;

export interface IssueRefCandidate {
  number: number;
  /** True when the ref names (or implies) THIS repo; false → `unreachable` (D6). */
  sameRepo: boolean;
  /** `owner/name` when the ref named a repo explicitly (cross-repo or same-repo). */
  repo?: string;
}

/** Extract every issue reference from PR text (title/body), deduped by `repo#number`. */
export function extractIssueRefs(text: string, repo: RepoRefLike): IssueRefCandidate[] {
  const byKey = new Map<string, IssueRefCandidate>();
  const add = (number: number, sameRepo: boolean, repoLabel?: string) => {
    const key = `${repoLabel ?? 'same'}#${number}`;
    if (!byKey.has(key)) byKey.set(key, { number, sameRepo, repo: repoLabel });
  };
  for (const m of text.matchAll(CROSS_REPO_ISSUE_REF)) {
    const owner = m[1]!;
    const name = m[2]!;
    add(Number(m[3]), owner === repo.owner && name === repo.name, `${owner}/${name}`);
  }
  for (const m of text.matchAll(ISSUE_URL)) {
    const owner = m[1]!;
    const name = m[2]!;
    add(Number(m[3]), owner === repo.owner && name === repo.name, `${owner}/${name}`);
  }
  for (const m of text.matchAll(BARE_ISSUE_REF)) {
    add(Number(m[2]), true);
  }
  return [...byKey.values()];
}
