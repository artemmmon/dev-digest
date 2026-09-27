/* query-keys.ts — every TanStack Query key in one place, hierarchical.
   A key is a prefix of the keys it scopes: invalidating `keys.pr.scope(id)` reaches
   everything cached for that PR, `keys.pr.reviews(id)` just its reviews. Hooks and
   invalidations build keys here, never as string literals. */

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
  repoContext: (repoId: Id) => ["context", repoId] as const,
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
    smartDiff: (prId: Id) => ["pr", prId, "smart-diff"] as const,
  },
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
  /** An agent's skill bindings (order + per-agent switch). */
  agentSkills: (agentId: Id) => ["agent-skills", agentId] as const,
};
