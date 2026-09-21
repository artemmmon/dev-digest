import type { SkillSource, SkillType } from '@devdigest/shared';

/** Ports of the skills module (onion-architecture: core declares, outer ring implements). */

/** A persisted skill, as the application needs it (no Drizzle row type). */
export interface SkillRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  /** Stored with the new version when the body changes; ignored otherwise. */
  message?: string;
}

/** One stored body of a skill. */
export interface SkillVersionRecord {
  version: number;
  body: string;
  message: string | null;
  createdAt: Date;
}

/** Workspace-scoped skill persistence (skills, skill_versions). */
export interface SkillStore {
  list(workspaceId: string): Promise<SkillRecord[]>;
  getById(workspaceId: string, id: string): Promise<SkillRecord | undefined>;
  /** Insert a skill AND its version-1 body (atomic). */
  insert(values: InsertSkill): Promise<SkillRecord>;
  /** A body change bumps the version and stores the new body (atomic, row-locked). */
  update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRecord | undefined>;
  setEnabled(workspaceId: string, id: string, enabled: boolean): Promise<SkillRecord | undefined>;
  /** Newest first; undefined when no such skill exists in the workspace. */
  listVersions(workspaceId: string, id: string): Promise<SkillVersionRecord[] | undefined>;
  /** False when no such skill existed in the workspace. Agent bindings cascade. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
}

/** One file inside an archive, as declared by its header (nothing is decompressed to list it). */
export interface ArchiveEntry {
  path: string;
  /** Uncompressed size in bytes, as declared by the archive. */
  size: number;
}

/**
 * Reads a .zip in memory. Never touches the file system and never runs anything:
 * `list` looks at headers only, `readText` decompresses one chosen entry.
 */
export interface ArchiveReader {
  list(bytes: Uint8Array): ArchiveEntry[];
  /** Throws if the entry is missing or larger than `maxBytes` uncompressed. */
  readText(bytes: Uint8Array, path: string, maxBytes: number): string;
}

/** Which agents use a skill. The agents module owns `agent_skills`, so this is a read port onto it. */
export interface SkillUsageReader {
  /** skill id → number of agents with an enabled binding to it. */
  agentCounts(workspaceId: string): Promise<Map<string, number>>;
  agentsUsing(workspaceId: string, skillId: string): Promise<Array<{ id: string; name: string }>>;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface SkillsServiceDeps {
  skills: SkillStore;
  archive: ArchiveReader;
  usage: SkillUsageReader;
  tokenizer: TokenCounter;
}
