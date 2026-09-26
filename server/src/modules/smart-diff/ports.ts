/**
 * Ports of the smart-diff module (onion-architecture: core declares, outer ring
 * implements). Narrow structural types only — never `pulls`' `ports.ts` types
 * (server INSIGHTS `:204`): the repository still satisfies these by shape.
 */

export interface SmartDiffPullRef {
  id: string;
}

/** One `pr_files` row, the fields the classifier + builder need. */
export interface SmartDiffFileRow {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffRunRow {
  prId: string | null;
  id: string;
  batchId: string | null;
}

export interface SmartDiffReviewRow {
  prId: string;
  id: string;
  runId: string | null;
}

/** Inputs of the "latest round" rule (same rule as the PR list), scoped to one PR. */
export interface SmartDiffRoundInputs {
  runs: SmartDiffRunRow[];
  reviews: SmartDiffReviewRow[];
}

/** Where one finding is anchored — `findings.file` + `findings.start_line`. */
export interface SmartDiffFindingLocation {
  file: string;
  startLine: number;
}

export interface SmartDiffStore {
  /** `undefined` when the PR doesn't exist in that workspace (→ 404 at the route). */
  pullInWorkspace(workspaceId: string, prId: string): Promise<SmartDiffPullRef | undefined>;
  files(prId: string): Promise<SmartDiffFileRow[]>;
  /** Both `runs` and `reviews` MUST be newest-first (see `pulls/cost.ts`, `pulls/findings.ts`). */
  roundInputs(prId: string): Promise<SmartDiffRoundInputs>;
  findingLocations(reviewIds: string[]): Promise<SmartDiffFindingLocation[]>;
}
