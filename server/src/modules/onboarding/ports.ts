import type { GitClient, LLMProvider, Provider, Tour } from '@devdigest/shared';

/** Ports of the onboarding module (onion-architecture: core declares, outer ring implements). */

export type GenerationStatus = 'idle' | 'running' | 'failed';

/** The persisted generation state of one repo, as the application needs it (no Drizzle row type). */
export interface GenerationRecord {
  status: GenerationStatus;
  startedAt: Date;
  error: string | null;
}

/** Persistence of the stored tour and of its generation state. Keyed by repo; the caller checks the workspace. */
export interface TourStore {
  /** The stored tour, or null when none is stored or the stored JSON no longer parses. */
  getTour(repoId: string): Promise<Tour | null>;
  getGeneration(repoId: string): Promise<GenerationRecord | null>;
  /**
   * Atomically mark the repo's generation `running`. Returns the stored start time, or null
   * when a generation is already running (the caller must not start another).
   */
  claim(repoId: string, now: Date): Promise<Date | null>;
  /**
   * Store the tour and set the generation `idle`, in one transaction, only while the row is
   * still the `running` one that began at `startedAt`. Returns false (and stores nothing)
   * when it is not — the repo was removed, or the run was already ended.
   */
  complete(repoId: string, startedAt: Date, tour: Tour): Promise<boolean>;
  /** Set the matching running generation `failed` with `message`; never touches the stored tour. */
  fail(repoId: string, startedAt: Date, message: string): Promise<void>;
  /** Every `running` generation becomes `failed` with `message`; returns how many. */
  reapRunning(message: string): Promise<number>;
}

/** The repo a tour is generated for — enough to run git against its clone. */
export interface TourRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<TourRepo | undefined>;
}

/** What the service reads from the repo index. Every read may be empty when the index is off or missing. */
export interface TourIntel {
  topFiles(repoId: string, n: number): Promise<string[]>;
  criticalPaths(repoId: string): Promise<string[][]>;
  /** The rendered repo map text within `tokenBudget`; '' when there is none. */
  repoMap(repoId: string, tokenBudget: number): Promise<string>;
  /** `lastIndexedSha` is '' when the index never produced a commit. */
  indexState(repoId: string): Promise<{ filesIndexed: number; lastIndexedSha: string }>;
}

export interface TourLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Everything the service collaborates with — narrow ports, functions for cross-module reads. */
export interface OnboardingDeps {
  store: TourStore;
  repos: RepoLookup;
  git: GitClient;
  intel: TourIntel;
  /** The workspace's provider + model for the `onboarding` feature. */
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  /** Lazy LLM client by provider id; throws a `config_error` AppError when that provider has no key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** The rendered system prompt. */
  systemPrompt: () => Promise<string>;
  tokenizer: { count(text: string): number };
  logger?: TourLogger;
  now?: () => number;
}
