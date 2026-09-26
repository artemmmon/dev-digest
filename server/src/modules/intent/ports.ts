import type { GitClient, GitHubClient, LLMProvider, PrIntent, Provider } from '@devdigest/shared';

/** Ports of the intent module (onion-architecture: core declares, outer ring implements). */

export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  base: string;
  headSha: string;
}

export interface IntentRepo {
  owner: string;
  name: string;
  defaultBranch: string;
}

/** One `pr_files` row, the fields the classifier needs. */
export interface IntentFile {
  path: string;
  patch: string | null;
}

export interface IntentContext {
  pull: IntentPull;
  repo: IntentRepo;
  files: IntentFile[];
  /** The currently-stored row, if any (drives `stale` and the "reuse, don't re-derive" rule). */
  stored?: PrIntent;
}

/** Workspace-scoped persistence of the per-PR intent row (`pr_intent`). */
export interface IntentStore {
  /** `undefined` when the PR doesn't exist in that workspace (→ 404 at the route). */
  context(workspaceId: string, prId: string): Promise<IntentContext | undefined>;
  /** Upsert on `pr_id` (create or re-derive overwrites). */
  upsert(prId: string, intent: PrIntent): Promise<void>;
}

/** Everything the intent service collaborates with — narrow ports, no Container. */
export interface IntentDeps {
  store: IntentStore;
  /** Lazy GitHub client; rejects (ConfigError) when GITHUB_TOKEN is not configured. */
  github: () => Promise<GitHubClient>;
  /** Clone-HEAD fallback read when there is no GitHub token (`via: 'clone-head'`). */
  git: GitClient;
  /** Lazy LLM client by provider id; throws when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The workspace's provider + model for the `review_intent` feature. */
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  /** The rendered classifier system prompt. */
  systemPrompt: () => Promise<string>;
  /** Token counter for the Live Log's prompt-size estimate. */
  tokenizer: { count(text: string): number };
  now?: () => number;
}
