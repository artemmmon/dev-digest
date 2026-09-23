import type {
  ConventionCategory,
  ConventionStatus,
  GitClient,
  LLMProvider,
  Provider,
  SkillSource,
  SkillType,
} from '@devdigest/shared';
import type { VerifiedConvention } from './domain.js';

/** Ports of the conventions module (onion-architecture: core declares, outer ring implements). */

/** A persisted convention candidate, as the application needs it (no Drizzle row type). */
export interface ConventionRecord {
  id: string;
  workspaceId: string;
  repoId: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceEndLine: number | null;
  evidenceSnippet: string;
  confidence: number;
  status: ConventionStatus;
  commitSha: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewConvention extends VerifiedConvention {
  category: ConventionCategory;
  commitSha: string | null;
}

/** A rule a reviewer already ruled on; never suggested again. */
export interface DecidedRule {
  rule: string;
  status: Extract<ConventionStatus, 'accepted' | 'rejected'>;
}

/** Workspace- and repo-scoped persistence of convention candidates. */
export interface ConventionStore {
  /** Every candidate of the repo (all statuses), newest first. */
  list(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  /** Accepted and rejected rules of the repo. */
  listDecided(workspaceId: string, repoId: string): Promise<DecidedRule[]>;
  /** Delete the repo's PENDING rows and insert `rows` as pending, in one transaction. */
  replacePending(
    workspaceId: string,
    repoId: string,
    rows: NewConvention[],
  ): Promise<ConventionRecord[]>;
  /** undefined when the id does not belong to that repo in that workspace. */
  getById(workspaceId: string, repoId: string, id: string): Promise<ConventionRecord | undefined>;
  /** The subset of `ids` that belong to the repo in the workspace. */
  getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]>;
  update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: { status?: ConventionStatus; rule?: string },
  ): Promise<ConventionRecord | undefined>;
}

/** The repo a scan runs on — enough to run git against its clone and to build GitHub links. */
export interface ConventionRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<ConventionRepo | undefined>;
}

export interface NewConventionSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  evidenceFiles: string[];
}

/** Creates the skill (the skills module owns the tables). */
export interface SkillWriter {
  insert(values: NewConventionSkill): Promise<{ id: string; name: string }>;
}

/** Binds a skill to an agent (the agents module owns `agent_skills`). */
export interface AgentSkillBinder {
  getById(workspaceId: string, agentId: string): Promise<{ id: string } | undefined>;
  /** Append as the last, enabled binding; a no-op when already bound. Bumps the agent version. */
  appendSkill(workspaceId: string, agentId: string, skillId: string): Promise<boolean>;
}

export interface ScanLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

/** Everything the service collaborates with — narrow ports, functions for cross-module reads. */
export interface ConventionsDeps {
  store: ConventionStore;
  repos: RepoLookup;
  git: GitClient;
  skills: SkillWriter;
  agents: AgentSkillBinder;
  /** Top-ranked file paths from repo-intel; `[]` when indexing is off or the repo is not indexed. */
  samples: (repoId: string, n: number) => Promise<string[]>;
  /** The workspace's provider + model for the `conventions` feature. */
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  /** Lazy LLM client by provider id; throws when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The rendered system prompt (template + placeholders). */
  systemPrompt: (vars: { max: string; categories: string }) => Promise<string>;
  logger?: ScanLogger;
  now?: () => number;
}
