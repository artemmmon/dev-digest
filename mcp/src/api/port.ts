import type {
  ActiveRunInfo,
  AgentInfo,
  BlastInfo,
  ConventionListInfo,
  PrInfo,
  RepoInfo,
  ReviewInfo,
  RunInfo,
} from './schemas.js';

/** A PR with its server id resolved (the API marks `id` optional in the list contract). */
export type PullRef = PrInfo & { id: string };

/**
 * Everything the tools need from the DevDigest API. Failures are `ApiError`s.
 * The last argument of every method is an optional abort signal.
 */
export interface DevDigestApi {
  listRepos(signal?: AbortSignal): Promise<RepoInfo[]>;
  listAgents(signal?: AbortSignal): Promise<AgentInfo[]>;
  /** DB-only lookup; `null` when the repo has no such PR persisted. */
  pullByNumber(repoId: string, number: number, signal?: AbortSignal): Promise<PullRef | null>;
  /** `GET /repos/:id/pulls` — syncs the PR list from GitHub, then lists it. */
  syncPulls(repoId: string, signal?: AbortSignal): Promise<PullRef[]>;
  /** `GET /pulls/:id` — refreshes files/commits from GitHub so a review sees a real diff. */
  refreshPull(prId: string, signal?: AbortSignal): Promise<void>;
  activeRuns(prId: string, signal?: AbortSignal): Promise<ActiveRunInfo[]>;
  /** Starts one agent's review (fire-and-forget on the server); returns the new run id. */
  startReview(prId: string, agentId: string, signal?: AbortSignal): Promise<{ runId: string }>;
  listRuns(prId: string, signal?: AbortSignal): Promise<RunInfo[]>;
  reviews(prId: string, signal?: AbortSignal): Promise<ReviewInfo[]>;
  conventions(repoId: string, signal?: AbortSignal): Promise<ConventionListInfo>;
  /** `GET /pulls/:id/blast` — DB-only: the precomputed blast radius, no GitHub call, no LLM. */
  blast(prId: string, signal?: AbortSignal): Promise<BlastInfo>;
}
