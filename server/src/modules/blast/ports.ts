/**
 * Blast radius ports (core). Narrow structural types only: this module never
 * imports repo-intel; the container adapts the repo-intel facade to `BlastIntel`
 * (server INSIGHTS: `ports.ts` is core and may import only zod / other core).
 */

import type { BlastIndexStatus } from '@devdigest/shared';

export interface BlastPullRef {
  id: string;
  repoId: string;
  headSha: string;
}

/** Driven port: the two reads this feature owns. */
export interface BlastStore {
  /** Undefined when the PR does not exist in the workspace. */
  pullInWorkspace(workspaceId: string, prId: string): Promise<BlastPullRef | undefined>;
  /** Changed file paths of the PR (`pr_files`), sorted. */
  changedPaths(prId: string): Promise<string[]>;
}

export interface BlastIndexSnapshot {
  status: BlastIndexStatus;
  /** '' when nothing has been indexed. */
  lastIndexedSha: string;
  degradedReason?: string;
}

export interface BlastFacadeResult {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  /** Per-caller-file endpoints/crons; absent on a degraded result. */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  /** True when the facade already cut a symbol's callers at its own per-symbol cap. */
  truncated?: boolean;
  degraded?: boolean;
  reason?: string;
}

/** Driven port: the repo-intel read model, flag included. */
export interface BlastIntel {
  enabled: boolean;
  indexState(repoId: string): Promise<BlastIndexSnapshot>;
  blastRadius(repoId: string, files: string[]): Promise<BlastFacadeResult>;
}

export interface BlastDeps {
  store: BlastStore;
  intel: BlastIntel;
}
