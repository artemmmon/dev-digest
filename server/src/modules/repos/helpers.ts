import { type Repo } from '@devdigest/shared';
import type { RepoRecord } from './ports.js';
import { AppError } from '../../platform/errors.js';
import {
  GITHUB_URL_REGEX,
  GITHUB_HTTPS_HOST,
} from './constants.js';

/**
 * F1 — repos pure helpers (extracted from routes.ts; no behaviour change).
 * Pure functions only — no I/O, no DB, no container.
 */

/** Parse `owner`/`name` from a GitHub URL (https or ssh form). */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  // https://github.com/owner/repo(.git)  |  git@github.com:owner/repo.git
  const match = url.trim().match(GITHUB_URL_REGEX);
  const owner = match?.[1];
  const name = match?.[2];
  if (!owner || !name || /^\.+$/.test(name)) {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  return { owner, name };
}

/**
 * Canonical https clone URL for a GitHub repo. The clone job always clones this,
 * never the raw user input, so only github.com is ever fetched.
 */
export function githubCloneUrl(owner: string, name: string): string {
  return `https://${GITHUB_HTTPS_HOST}/${owner}/${name}.git`;
}

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: RepoRecord): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
    stack: row.stack,
  };
}
