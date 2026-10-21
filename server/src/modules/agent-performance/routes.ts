import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPerformance, AgentStats, StatsPeriodQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AgentPerformanceService } from './service.js';

/**
 * Agent performance (SPEC-16). Read-only; every route is workspace-scoped through `getContext`.
 *   GET /agents/:id/stats?period=&from=&to=   → one agent's figures (404 outside the workspace)
 *   GET /agent-performance?period=&from=&to=  → totals, one entry per agent, cost breakdowns
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentPerformanceService(app.container.agentPerformanceDeps);

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: StatsPeriodQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.agentStats(workspaceId, req.params.id, req.query);
    },
  );

  app.get(
    '/agent-performance',
    { schema: { querystring: StatsPeriodQuery, response: { 200: AgentPerformance } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.workspace(workspaceId, req.query);
    },
  );
}
