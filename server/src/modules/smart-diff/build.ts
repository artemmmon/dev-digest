import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
}

/**
 * Group changed files by role and attach the latest round's finding lines
 * (spec 09). Pure — no I/O. Always emits all 5 groups in
 * `SMART_DIFF_ROLE_ORDER`, even when a group has no files (the client hides
 * empty groups; the server keeps the shape simple and total).
 */
export function buildSmartDiff(files: SmartDiffInputFile[], findings: SmartDiffInputFinding[]): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    let bucket = linesByPath.get(f.file);
    if (!bucket) {
      bucket = new Set<number>();
      linesByPath.set(f.file, bucket);
    }
    bucket.add(f.startLine);
  }

  const filesByRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const role of SMART_DIFF_ROLE_ORDER) filesByRole.set(role, []);

  for (const file of files) {
    const role = classifyFile(file.path);
    const findingLines = [...(linesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    const entry: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    };
    filesByRole.get(role)!.push(entry);
  }

  const groups: SmartDiffGroup[] = SMART_DIFF_ROLE_ORDER.map((role) => ({
    role,
    files: filesByRole.get(role) ?? [],
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: {
      too_big: false,
      total_lines: totalLines,
      proposed_splits: [],
    },
  };
}
