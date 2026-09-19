/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export { CLONE_JOB_KIND } from '../_shared/ports.js';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 * Anchored on both ends and limited to GitHub's name alphabet: owner/name end up
 * in a filesystem path (`<cloneDir>/<owner>/<name>`), so `..` or a foreign host
 * must never get through.
 */
export const GITHUB_URL_REGEX =
  /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Host every repo is cloned from. */
export const GITHUB_HTTPS_HOST = 'github.com';
