import type { CiFailOn, LLMProvider, Provider, ReviewStrategy } from '@devdigest/shared';

/** Ports of the agents module (onion-architecture: core declares, outer ring implements). */

/** A persisted agent, as the application needs it (no Drizzle row type). */
export interface AgentRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  /** Skills that reach the prompt (binding and skill both enabled); set by `list` only. */
  skillCount?: number;
}

/** An immutable config snapshot; `configJson` is untyped jsonb, parsed at the DTO boundary. */
export interface AgentVersionRecord {
  agentId: string;
  version: number;
  configJson: unknown;
  createdAt: Date;
}

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** One agent → skill link, in `order` ascending. */
export interface SkillLink {
  skillId: string;
  order: number;
  enabled: boolean;
}

/** A requested binding; its position in the array becomes its `order`. */
export interface SkillBinding {
  skillId: string;
  enabled: boolean;
}

/** A skill as the prompt needs it: enabled binding, enabled skill, in order. */
export interface ResolvedSkill {
  id: string;
  name: string;
  body: string;
}

/** Workspace-scoped agent persistence (agents, agent_versions, agent_skills). */
export interface AgentStore {
  list(workspaceId: string): Promise<AgentRecord[]>;
  listEnabled(workspaceId: string): Promise<AgentRecord[]>;
  getById(workspaceId: string, id: string): Promise<AgentRecord | undefined>;
  /** id → name for the given agents in the workspace, in one query. */
  namesByIds(workspaceId: string, ids: string[]): Promise<Map<string, string>>;
  /** False when no such agent existed in the workspace. */
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  /** Insert an agent AND record version 1 (atomic). */
  insert(values: InsertAgent): Promise<AgentRecord>;
  /** A config change bumps the version and snapshots it (atomic, row-locked). */
  update(workspaceId: string, id: string, patch: UpdateAgent): Promise<AgentRecord | undefined>;
  listVersions(agentId: string): Promise<AgentVersionRecord[]>;
  getVersion(agentId: string, version: number): Promise<AgentVersionRecord | undefined>;
  linkedSkills(agentId: string): Promise<SkillLink[]>;
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
  /**
   * Replace the whole set, order = index (atomic, agent row-locked). When the enabled,
   * ordered list changes it bumps the agent version and snapshots it. False = no such agent.
   */
  setSkills(workspaceId: string, agentId: string, bindings: SkillBinding[]): Promise<boolean>;
  /** Skills to put in the prompt, in binding order: binding AND skill enabled. */
  resolvedSkills(agentId: string): Promise<ResolvedSkill[]>;
  /** The subset of `skillIds` that exist in the workspace. */
  skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>>;
}

export interface AgentsServiceDeps {
  agents: AgentStore;
  /** Lazy LLM client by provider id (needs a stored key). */
  llm: (provider: Provider) => Promise<LLMProvider>;
}
