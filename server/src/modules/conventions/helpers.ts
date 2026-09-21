import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRecord } from './ports.js';

/** `https://github.com/o/n/blob/<sha>/<path>#L10-L14`; each path segment is URL-encoded. */
export function githubBlobUrl(
  owner: string,
  name: string,
  sha: string,
  path: string,
  line: number,
  endLine?: number | null,
): string {
  const encodedPath = path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
    .join('/');
  const anchor = endLine && endLine > line ? `#L${line}-L${endLine}` : `#L${line}`;
  return `https://github.com/${owner}/${name}/blob/${sha}/${encodedPath}${anchor}`;
}

export function toCandidateDto(
  row: ConventionRecord,
  repo: { owner: string; name: string },
): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath,
    evidence_line: row.evidenceLine,
    evidence_end_line: row.evidenceEndLine,
    evidence_snippet: row.evidenceSnippet,
    evidence_url:
      row.commitSha && row.evidencePath
        ? githubBlobUrl(
            repo.owner,
            repo.name,
            row.commitSha,
            row.evidencePath,
            row.evidenceLine,
            row.evidenceEndLine,
          )
        : null,
    confidence: row.confidence,
    status: row.status,
    commit_sha: row.commitSha,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
