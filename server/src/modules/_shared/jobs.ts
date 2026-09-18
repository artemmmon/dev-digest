/**
 * Job serialisation key for work on one repo's clone directory. Clone, refresh,
 * index and resync jobs all touch `<cloneDir>/<owner>/<name>` (git fetch/reset,
 * a delete-and-reclone, a full reindex), so they must not overlap for the same
 * repo. Every such payload carries `repoId`.
 */
export function repoJobKey(payload: unknown): string {
  return `repo:${(payload as { repoId: string }).repoId}`;
}
