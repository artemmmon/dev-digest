/* query-keys.ts — every TanStack Query key in one place, hierarchical.
   A key is a prefix of the keys it scopes: invalidating `keys.pr.scope(id)` reaches
   everything cached for that PR, `keys.pr.reviews(id)` just its reviews. Hooks and
   invalidations build keys here, never as string literals. */

import type { StatsPeriodSelection } from "./stats-period";

type Id = string | number | null | undefined;

export const keys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  /** Without a provider: every provider's model list (prefix). */
  providerModels: (provider?: string | null) =>
    (provider ? ["provider-models", provider] : ["provider-models"]) as readonly string[],

  repos: () => ["repos"] as const,
  /** A repo's PR list (with the latest-round cost/score/findings rollups). */
  pulls: (repoId: Id) => ["pulls", repoId] as const,
  /** Every repo's PR list (prefix) — the rollups change when any run settles. */
  allPulls: () => ["pulls"] as const,
  repoIntelState: (repoId: Id) => ["repo-intel-state", repoId] as const,

  pr: {
    /** Everything cached for one PR (prefix). */
    scope: (prId: Id) => ["pr", prId] as const,
    detail: (prId: Id) => ["pr", prId, "detail"] as const,
    reviews: (prId: Id) => ["pr", prId, "reviews"] as const,
    runs: (prId: Id) => ["pr", prId, "runs"] as const,
    activeRuns: (prId: Id) => ["pr", prId, "active-runs"] as const,
    comments: (prId: Id) => ["pr", prId, "comments"] as const,
    intent: (prId: Id) => ["pr", prId, "intent"] as const,
    brief: (prId: Id) => ["pr", prId, "brief"] as const,
    smartDiff: (prId: Id) => ["pr", prId, "smart-diff"] as const,
    blast: (prId: Id) => ["pr", prId, "blast"] as const,
    /** The PR's multi-agent run list (prefix of the single-run keys below). */
    multiAgentRuns: (prId: Id) => ["pr", prId, "multi-agent-runs"] as const,
    /** One multi-agent run (columns, groups, totals). */
    multiAgentRun: (prId: Id, runId: Id) => ["pr", prId, "multi-agent-runs", runId] as const,
  },
  /** Average duration/cost per agent over its last runs (Configure run estimates). */
  reviewEstimates: () => ["review-estimates"] as const,
  runTrace: (runId: Id) => ["run-trace", runId] as const,

  agents: () => ["agents"] as const,
  agent: (id: Id) => ["agent", id] as const,

  skills: () => ["skills"] as const,
  skill: (id: Id) => ["skill", id] as const,
  /** Every per-skill query (detail, versions, agents) — a prefix of `skill(id)`. */
  skillScope: () => ["skill"] as const,
  skillVersions: (id: Id) => ["skill", id, "versions"] as const,
  skillAgents: (id: Id) => ["skill", id, "agents"] as const,
  /** A repo's convention candidates + last scan (the Conventions page). */
  conventions: (repoId: Id) => ["conventions", repoId] as const,
  /** A repo's onboarding tour + generation state (one cache entry; the page polls it while generating). */
  onboardingTour: (repoId: Id) => ["onboarding-tour", repoId] as const,
  /** An agent's skill bindings (order + per-agent switch). */
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,
  /** A repo's project documents (list); a prefix of the single-document keys below. */
  projectDocs: (repoId: Id) => ["project-docs", repoId] as const,
  /** One project document's content. */
  projectDoc: (repoId: Id, path: Id) => ["project-docs", repoId, path] as const,
  /** An agent's attached documents for one repo (+ the ones inherited through skills). */
  agentContext: (agentId: Id, repoId: Id) => ["agent-context", agentId, repoId] as const,
  /** A skill's attached documents for one repo. */
  skillContext: (skillId: Id, repoId: Id) => ["skill-context", skillId, repoId] as const,

  eval: {
    /** Everything cached for the eval pipeline (prefix). */
    scope: () => ["eval"] as const,
    /** One agent's eval cases and runs (prefix of `cases` / `runs` / `trend`). */
    agent: (agentId: Id) => ["eval", "agent", agentId] as const,
    cases: (agentId: Id) => ["eval", "agent", agentId, "cases"] as const,
    runs: (agentId: Id, limit?: number) => ["eval", "agent", agentId, "runs", limit ?? null] as const,
    /** Every counted run of one agent as chart points (under `agent`, so a case or run change refreshes it). */
    trend: (agentId: Id) => ["eval", "agent", agentId, "trend"] as const,
    /** Two runs of one agent side by side (older/newer is decided by the server). */
    compare: (a: Id, b: Id) => ["eval", "compare", a, b] as const,
    dashboard: () => ["eval", "dashboard"] as const,
  },

  agentPerformance: {
    /** Everything cached for the Agent Performance page and the agent Stats tab (prefix). */
    scope: () => ["agent-performance"] as const,
    /** The workspace dashboard for one period selection. */
    workspace: (sel: StatsPeriodSelection) => ["agent-performance", "workspace", sel] as const,
    /** One agent's stats for one period selection. */
    agent: (agentId: Id, sel: StatsPeriodSelection) => ["agent-performance", "agent", agentId, sel] as const,
  },
  ci: {
    /** Everything cached for Export to CI (prefix): overviews and run lists. */
    scope: () => ["ci"] as const,
    /** One agent's CI installations and its 20 newest runs. */
    overview: (agentId: Id) => ["ci", "agent", agentId] as const,
    /** The CI Runs page list for one filter set (infinite, so the filters are the key). */
    runs: (filters: Record<string, string | null | undefined>) => ["ci", "runs", filters] as const,
  },
};

/** Predicate for `invalidateQueries`: any PR's cached reviews, when the PR id is not known. */
export function isPrReviewsKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "pr" && queryKey[2] === "reviews";
}
