import { INTENT_LIMITS } from '@devdigest/shared';
import { DOC_EXTENSIONS, PR_ADDED_DOC_PREFIXES } from './constants.js';

/**
 * Pure link/reference extraction (D4–D6): pulls candidate issue refs, ticket
 * keys and doc links out of untrusted PR text. Every regex here is bounded and
 * anchored (character classes, no nested quantifiers) — no ReDoS. Nothing here
 * fetches anything; the service decides what to do with each candidate.
 */

export interface RepoRefLike {
  owner: string;
  name: string;
}

// ---- Closing-issue references (regex fallback path, D6) --------------------

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

// ---- Ticket keys (Jira/Linear-style, always `unreachable` in v1) -----------

const TICKET_KEY = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g;

/** Extract distinct ticket-style keys (e.g. `PROJ-42`) from title/body/branch. */
export function extractTicketKeys(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(TICKET_KEY)) seen.add(m[0]);
  return [...seen].slice(0, INTENT_LIMITS.maxTicketKeys);
}

// ---- Doc links (D4/D5) ------------------------------------------------------

// Every quantifier is bounded (no ReDoS on attacker-controlled PR bodies).
/** Markdown link target; `![img](…)` images and badges are not doc links. */
const MD_LINK = /(?<!!)\[([^\]\n]{0,300})]\(([^)\s]{1,500})\)/g;
const MD_IMAGE = /!\[[^\]\n]{0,300}]\([^)\s]{1,500}\)/g;
const DOC_EXT_TAIL = /\.(?:md|mdx|txt|rst)$/i;
/** Hosts whose links are plans/specs/tickets even without a doc extension. */
const DOC_HOST = /^https?:\/\/(?:[\w-]{1,63}\.){0,4}(?:notion\.so|notion\.site|docs\.google\.com|atlassian\.net|linear\.app|gist\.github\.com)(?:[/:?#]|$)/i;
/** Link text that names a plan/spec/design doc (e.g. `[the spec](…)`). */
const DOC_LINK_TEXT = /\b(?:plan|spec|specification|design|rfc|adr|proposal|doc|docs|ticket|issue)\b/i;
const BLOB_URL = /https:\/\/github\.com\/[\w.-]{1,100}\/[\w.-]{1,100}\/blob\/[^\s)]{1,500}/g;
/** Any absolute URL — removed before the bare-path scan so a URL never yields a path. */
const ANY_URL = /\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s)]{1,2000}/gi;
/** A bare repo path: not preceded by a path/URL char, not followed by more path. */
const BARE_DOC_PATH = /(?<![\w./:@-])([\w-][\w./-]{0,299}\.(?:md|mdx|txt|rst))(?![\w/])/gi;
/** Only the head of a huge body is scanned for links. */
const MAX_SCAN_CHARS = 20_000;

/**
 * Extract distinct doc-link candidates: markdown link targets, blob URLs, and
 * bare repo paths. Bare paths are scanned only in the text left after every
 * markdown-link target and URL is removed, so `https://notion.so/design.md` is
 * one (external → unreachable) candidate, never also a same-repo path. A bare
 * URL counts only when it ends in a doc extension (badges/images are not docs).
 * An external markdown link counts only when it looks like a plan/spec: a doc
 * extension, a known docs/ticket host, or link text that says so — so a PR
 * footer like `[Claude Code](https://claude.com/…)` is not "missing context".
 */
export function extractDocRefs(text: string): string[] {
  const scanned = text.slice(0, MAX_SCAN_CHARS);
  const seen = new Set<string>();
  for (const m of scanned.matchAll(MD_LINK)) {
    const [, label, target] = m as unknown as [string, string, string];
    if (!/^https?:\/\//i.test(target) || isDocLikeUrl(target, label)) seen.add(target);
  }
  for (const m of scanned.matchAll(BLOB_URL)) seen.add(m[0]);
  const withoutImages = scanned.replace(MD_IMAGE, ' ');
  for (const m of withoutImages.replace(MD_LINK, ' ').matchAll(ANY_URL)) {
    if (DOC_EXT_TAIL.test(m[0])) seen.add(m[0]);
  }
  const withoutLinks = withoutImages.replace(MD_LINK, ' ').replace(ANY_URL, ' ');
  for (const m of withoutLinks.matchAll(BARE_DOC_PATH)) seen.add(m[1]!);
  return [...seen];
}

function isDocLikeUrl(url: string, label: string): boolean {
  return (
    url.startsWith('https://github.com/') ||
    DOC_EXT_TAIL.test(url) ||
    DOC_HOST.test(url) ||
    DOC_LINK_TEXT.test(label)
  );
}

/**
 * Fail-closed repo-relative path normalisation (D4): rejects `..`, an absolute
 * path, backslashes, percent-encoded traversal, a NUL byte, anything over
 * 300 chars, and any extension that isn't a doc extension. Returns `null` on
 * any rejection — the caller then reports the source as `unreachable`.
 */
export function normalizeRepoPath(raw: string): string | null {
  if (!raw || raw.length > 300) return null;
  if (raw.includes('\0')) return null;
  if (/%2e|%2f/i.test(raw)) return null;
  if (raw.includes('\\')) return null;
  if (raw.startsWith('/')) return null;
  const segments = raw.split('/');
  if (segments.some((s) => s.length === 0 || s === '.' || s === '..')) return null;
  const ext = raw.split('.').pop()?.toLowerCase();
  if (!ext || !DOC_EXTENSIONS.has(ext)) return null;
  return raw;
}

export interface DocRefResolution {
  raw: string;
  /** Repo-relative path, once validated — null when invalid or another repo/host. */
  path: string | null;
  /** False for another host, another repo, or a rejected path → `unreachable`. */
  sameRepo: boolean;
}

/** Resolve one doc-link candidate against the current repo (D4). */
export function resolveDocRef(raw: string, repo: RepoRefLike): DocRefResolution {
  const blob = raw.match(
    /^https:\/\/github\.com\/([\w.-]{1,100})\/([\w.-]{1,100})\/blob\/[^/]{1,200}\/(.{1,500})$/,
  );
  if (blob) {
    const owner = blob[1]!;
    const name = blob[2]!;
    const rest = blob[3]!;
    const sameRepo =
      owner.toLowerCase() === repo.owner.toLowerCase() &&
      name.toLowerCase() === repo.name.toLowerCase();
    return { raw, sameRepo, path: sameRepo ? normalizeRepoPath(safeDecode(rest)) : null };
  }
  if (/^https?:\/\//i.test(raw)) {
    return { raw, sameRepo: false, path: null };
  }
  return { raw, sameRepo: true, path: normalizeRepoPath(raw) };
}

/** `decodeURIComponent` that returns `""` (→ rejected path) on a malformed escape. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

/** True when a PR-added path counts as an available doc regardless of links (D5). */
export function isPrAddedDoc(path: string): boolean {
  return PR_ADDED_DOC_PREFIXES.some((prefix) => path.startsWith(prefix)) && DOC_EXTENSIONS.has(
    path.split('.').pop()?.toLowerCase() ?? '',
  );
}
