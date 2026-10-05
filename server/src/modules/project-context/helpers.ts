import type { ProjectDocType } from '@devdigest/shared';
import { DOCUMENT_DIRS } from './constants.js';

const DIRS: ReadonlySet<string> = new Set(DOCUMENT_DIRS);

/**
 * True when a directory segment of `path` is `specs`, `docs` or `insights` and the file
 * name ends in `.md` (case-sensitive). This is the matcher for the one constant pattern
 * `DOCUMENT_PATTERN`, not a general glob engine (`_shared/glob.ts` cannot express it).
 */
export function isProjectDocument(path: string): boolean {
  const segments = path.split('/');
  const file = segments.pop() ?? '';
  return file.length > '.md'.length && file.endsWith('.md') && segments.some((s) => DIRS.has(s));
}

/** The first directory segment from the left that names a document type (AC-3). */
export function documentType(path: string): ProjectDocType {
  const segments = path.split('/').slice(0, -1);
  const hit = segments.find((s) => DIRS.has(s));
  return (hit ?? 'docs') as ProjectDocType;
}

/** Keep the first occurrence of each path (AC-49). */
export function uniquePaths(paths: Iterable<string>): string[] {
  return [...new Set(paths)];
}
