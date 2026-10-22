import type { AgentPerformance, AgentStats, StatsPeriodQuery } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { aggregateAgent, aggregateWorkspace } from './aggregate.js';
import { resolveWindow } from './period.js';
import type { AgentPerformanceDeps } from './ports.js';

/**
 * Read-only performance views (SPEC-16). Both reads fetch counted runs for the same window and
 * hand them to the same pure aggregator, so the dashboard and the Stats tab agree by construction.
 * No model call, no job, no write.
 */
export class AgentPerformanceService {
  constructor(private readonly deps: AgentPerformanceDeps) {}

  /** `GET /agents/:id/stats`: one agent of the caller's workspace, 404 for any other. */
  async agentStats(workspaceId: string, agentId: string, query: StatsPeriodQuery): Promise<AgentStats> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const window = resolveWindow(query, this.deps.now());
    const rows = await this.deps.store.countedRuns(workspaceId, window, agent.id);
    return aggregateAgent(rows, { id: agent.id, name: agent.name });
  }

  /** `GET /agent-performance`: every agent of the workspace, totals and cost breakdowns. */
  async workspace(workspaceId: string, query: StatsPeriodQuery): Promise<AgentPerformance> {
    const window = resolveWindow(query, this.deps.now());
    const [agents, rows, outside] = await Promise.all([
      this.deps.agents.list(workspaceId),
      this.deps.store.countedRuns(workspaceId, window),
      this.deps.store.hasCountedRunsOutside(workspaceId, window),
    ]);
    return aggregateWorkspace(
      agents.map((a) => ({ id: a.id, name: a.name })),
      rows,
      outside,
    );
  }
}
