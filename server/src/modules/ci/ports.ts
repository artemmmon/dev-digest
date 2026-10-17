import type {
  CiFailureReason,
  CiMethod,
  CiPostAs,
  CiResultArtifact,
  CiRunPage,
  CiRunStatus,
  CiRunsQuery,
  CiTrigger,
  GitHubClient,
  Provider,
  ReviewStrategy,
  CiFailOn,
  RunTrace,
  Verdict,
} from '@devdigest/shared';

/**
 * Ports of the ci module (onion-architecture: core declares, outer ring implements).
 * Collaborators from other modules are structural, so the module never imports another
 * module's internals and adapters never import this module.
 */

// ---------- Runner bundle and zip (adapters) ----------

/** The built agent-runner bundle (implemented by `adapters/runner-bundle`). */
export interface RunnerBundleSource {
  /** The regular files of the bundle directory. Throws `ValidationError` when it is not built. */
  read(): Promise<Array<{ name: string; bytes: Uint8Array }>>;
}

/** Builds a .zip in memory (implemented by `adapters/archive/zip.ts`). */
export interface ZipWriter {
  zip(files: Array<{ path: string; bytes: Uint8Array }>): Uint8Array;
}

/** Reads a downloaded artifact archive in memory (same shape as `FflateZipReader`). */
export interface ResultArchiveReader {
  list(bytes: Uint8Array): Array<{ path: string; size: number }>;
  /** Throws if the entry is missing or larger than `maxBytes` uncompressed. */
  readText(bytes: Uint8Array, path: string, maxBytes: number): string;
}

// ---------- Other modules (structural) ----------

/** An agent as the export needs it (satisfied by `AgentRecord`). */
export interface CiAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  version: number;
}

/** A skill bound to the agent that reaches the prompt (satisfied by `ResolvedSkill`). */
export interface CiSkill {
  id: string;
  name: string;
  body: string;
}

/** What the ci module reads from the agents module (satisfied by `AgentsRepository`). */
export interface CiAgentSource {
  getById(workspaceId: string, id: string): Promise<CiAgent | undefined>;
  /** Enabled bindings of enabled skills, in binding order. */
  resolvedSkills(agentId: string): Promise<CiSkill[]>;
}

/** A repository as the export needs it (satisfied by `RepoRecord`). */
export interface CiRepo {
  id: string;
  /** `owner/name`. */
  fullName: string;
  defaultBranch: string;
}

/** What the ci module reads from the repos module (satisfied by `RepoRepository`). */
export interface CiRepoSource {
  getById(workspaceId: string, id: string): Promise<CiRepo | undefined>;
}

// ---------- Own store (implemented by `CiRepository`, Step 15) ----------

/** An installation as stored (a row of `ci_installations`). */
export interface CiInstallationRecord {
  id: string;
  workspaceId: string;
  agentId: string;
  repoId: string | null;
  /** `owner/name`. */
  repo: string;
  /** GitHub's numeric repository id; null until learned (token-less zip export). */
  repositoryId: number | null;
  method: CiMethod;
  agentVersion: number | null;
  runnerVersion: string | null;
  manifestSha256: string | null;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  prUrl: string | null;
  installedAt: Date;
  endedAt: Date | null;
  lastIngestedAt: Date | null;
}

export type NewCiInstallation = Omit<
  CiInstallationRecord,
  'id' | 'endedAt' | 'lastIngestedAt'
>;

/** An installation with the status and time of its newest run. */
export interface CiInstallationWithLastRun extends CiInstallationRecord {
  lastRunStatus: CiRunStatus | null;
  lastRunAt: Date | null;
}

/** A verified or rejected workflow run, ready to store (a row of `ci_runs`). */
export interface NewCiRun {
  workspaceId: string;
  installationId: string;
  agentId: string | null;
  agentName: string | null;
  repo: string;
  prNumber: number | null;
  prTitle: string | null;
  /** The GitHub Actions workflow run id. */
  githubRunId: number;
  commitSha: string | null;
  jobUrl: string | null;
  ranAt: Date | null;
  status: CiRunStatus;
  failureReason: CiFailureReason | null;
  /** The verified result; null for a Failed run. */
  result: CiResultArtifact | null;
}

/** The `agent_runs` row written for a verified run (Step 15). */
export interface NewCiAgentRun {
  workspaceId: string;
  agentId: string | null;
  model: string;
  costUsd: number | null;
  durationMs: number;
  findingsCount: number;
  verdict: Verdict;
  ranAt: Date | null;
}

/** What the ci module reads and writes in its own tables (and the ingest rows it owns). */
export interface CiStore {
  /** The installation of a repository that has not ended, if any. */
  activeInstallationForRepo(workspaceId: string, repo: string): Promise<CiInstallationRecord | undefined>;
  listInstallations(workspaceId: string, agentId: string): Promise<CiInstallationWithLastRun[]>;
  listActiveInstallations(workspaceId: string): Promise<CiInstallationRecord[]>;
  /** One transaction: end `endIds`, then insert `next`. */
  replaceInstallation(next: NewCiInstallation, endIds: string[]): Promise<CiInstallationRecord>;
  /** True when this caller won the right to ingest (not ingested within the skip window, or `force`). */
  claimIngest(installationId: string, force: boolean): Promise<boolean>;
  setRepositoryId(installationId: string, repositoryId: number): Promise<void>;
  /** The subset of GitHub run ids already stored in the workspace. */
  knownRunIds(workspaceId: string, githubRunIds: number[]): Promise<Set<number>>;
  /**
   * Store a run once: `ON CONFLICT DO NOTHING`. The agent run and its trace are written
   * in the same transaction, and only when the run row was inserted. False when it already existed.
   */
  storeRun(run: NewCiRun, agentRun: NewCiAgentRun | null, trace: RunTrace | null): Promise<boolean>;
  listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRunPage>;
  /** Memory of the repository plus workspace-wide (global) memory, oldest first. */
  memoryFor(workspaceId: string, repoId: string): Promise<Array<{ kind: string; content: string }>>;
}

export interface CiLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Everything `CiService` collaborates with: narrow ports, never the Container. */
export interface CiDeps {
  store: CiStore;
  agents: CiAgentSource;
  repos: CiRepoSource;
  /** The GitHub client for the stored token; rejects with a fixed-message `AppError` without one. */
  github: () => Promise<GitHubClient>;
  bundle: RunnerBundleSource;
  zip: ZipWriter;
  archive: ResultArchiveReader;
  now: () => Date;
  log: CiLogger;
}
