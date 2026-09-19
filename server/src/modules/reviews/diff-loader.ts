import type { GitClient, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '@devdigest/reviewer-core';
import type { RunRepo } from './deps.js';
import type { PullRow, ReviewStore } from './ports.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; falls
 * back to assembling a synthetic unified diff from the persisted pr_files
 * patches (so the reviewer works even before a clone completes / in tests).
 */
export async function loadDiff(
  git: GitClient,
  reviews: ReviewStore,
  pull: PullRow,
  repoRow: RunRepo,
): Promise<UnifiedDiff> {
  try {
    const diff = await git.diff(
      { owner: repoRow.owner, name: repoRow.name },
      pull.base,
      pull.headSha,
    );
    if (diff.files.length > 0) return diff;
  } catch {
    /* fall through to pr_files reconstruction */
  }
  return diffFromPrFiles(reviews, pull.id);
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(reviews: ReviewStore, prId: string): Promise<UnifiedDiff> {
  const files = await reviews.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
