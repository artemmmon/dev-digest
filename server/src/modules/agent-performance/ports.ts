/**
 * Ports of the agent-performance module (onion-architecture: core declares, outer ring
 * implements). Narrow structural types only, so the container can pass `agentsRepo` as it is.
 */

/** The time window of a read; both bounds are inclusive instants. */
export interface StatsWindow {
  from: Date;
  to: Date;
}

/** One counted run (done, failed or cancelled) with the decisions on its findings. */
export interface CountedRun {
  /** Null when the agent was deleted after the run. */
  agentId: string | null;
  model: string | null;
  status: 'done' | 'failed' | 'cancelled';
  /** Null = the run stored no cost. */
  costUsd: number | null;
  durationMs: number | null;
  ranAt: Date;
  accepted: number;
  dismissed: number;
  pending: number;
}

/** Read-only store of counted runs (implemented by the repository). */
export interface RunStatsStore {
  /** Counted runs of the workspace that started inside the window; optionally of one agent. */
  countedRuns(workspaceId: string, window: StatsWindow, agentId?: string): Promise<CountedRun[]>;
  /** True when the workspace has a counted run that started outside the window. */
  hasCountedRunsOutside(workspaceId: string, window: StatsWindow): Promise<boolean>;
}

/** What the module reads from the agents module (satisfied by `AgentsRepository`). */
export interface PerformanceAgentSource {
  /** Every agent of the workspace, enabled or not. */
  list(workspaceId: string): Promise<Array<{ id: string; name: string }>>;
  getById(workspaceId: string, id: string): Promise<{ id: string; name: string } | undefined>;
}

export interface AgentPerformanceDeps {
  store: RunStatsStore;
  agents: PerformanceAgentSource;
  now: () => Date;
}
