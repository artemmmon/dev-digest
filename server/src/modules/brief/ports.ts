import type {
  BlastRadiusResponse,
  GitHubClient,
  LLMProvider,
  PrBrief,
  PrIntentResponse,
  Provider,
  SmartDiffRole,
} from '@devdigest/shared';

/**
 * Ports of the brief module (core: the outer ring implements them, the container wires
 * them). Structural types only — this module never imports intent, blast, smart-diff or
 * project-context; the container adapts each one.
 */

export interface BriefPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface BriefRepo {
  owner: string;
  name: string;
}

/** One `pr_files` row, the fields the brief needs. */
export interface BriefFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface BriefContext {
  pull: BriefPull;
  repo: BriefRepo;
  files: BriefFile[];
  /** The stored brief, when there is one and it still matches the contract. */
  stored?: PrBrief;
}

/** Workspace-scoped persistence of the per-PR brief (`pr_brief`). */
export interface BriefStore {
  /** `undefined` when the PR is not in that workspace (→ 404 at the route). */
  context(workspaceId: string, prId: string): Promise<BriefContext | undefined>;
  /** Upsert on `pr_id`: a pull request has at most one stored brief. */
  save(prId: string, brief: PrBrief): Promise<void>;
}

/** The logging call the service makes (Fastify's logger satisfies it). */
export interface BriefLog {
  info(obj: object, msg: string): void;
}

export interface BriefDeps {
  store: BriefStore;
  /** The stored intent (read only; never derived for a brief). */
  intent: { get(workspaceId: string, prId: string): Promise<PrIntentResponse> };
  /** The PR's precomputed blast radius (read only). */
  blast: { forPull(workspaceId: string, prId: string): Promise<Pick<BlastRadiusResponse, 'blast'>> };
  /** Project documents agents receive for the repo, in candidate order. */
  documents: {
    candidateDocuments(
      workspaceId: string,
      repoId: string,
    ): Promise<{ path: string; text: string; tokens: number }[]>;
  };
  /** Smart Diff role group of a path. */
  roleOf: (path: string) => SmartDiffRole;
  /** Lazy GitHub client; rejects when no token is configured. */
  github: () => Promise<Pick<GitHubClient, 'closingIssues' | 'getIssue'>>;
  /** Lazy LLM client by provider id; throws `ConfigError` when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The workspace's provider + model for the `risk_brief` feature. */
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  /** The rendered system prompt. */
  systemPrompt: () => Promise<string>;
  /** The server's token counter. */
  tokenizer: { count(text: string): number };
  log: BriefLog;
  now?: () => number;
}
