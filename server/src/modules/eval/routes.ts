import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EvalCaseRecord,
  EvalCaseSave,
  EvalCompare,
  EvalDashboardOverview,
  EvalRunStarted,
  EvalRunsOverview,
  EvalTrend,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RUN_LIST_DEFAULT_LIMIT, RUN_LIST_MAX_LIMIT } from './constants.js';
import { EvalService } from './service.js';

/**
 * Eval pipeline (SPEC-13). Every route is workspace-scoped through `getContext`.
 *   GET  /agents/:id/eval-cases      → the agent's cases with their latest counted outcome
 *   POST /agents/:id/eval-cases      → save a case (201); 409 for a second case of one finding
 *   POST /agents/:id/eval-runs       → start a run in the background (202); 409 while one runs
 *   GET  /agents/:id/eval-runs       → recent runs + the two latest counted runs
 *   GET  /eval-runs/compare?a=&b=    → two counted runs of one agent, side by side
 *   GET  /eval/dashboard             → every agent's latest counted run + the newest runs
 *   PUT    /eval-cases/:id           → edit a case in place (same id, same source finding)
 *   DELETE /eval-cases/:id           → delete a case (204); 409 while a run of its agent runs
 *   GET  /agents/:id/eval-trend      → every counted run of the agent, oldest first
 */
const RunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(RUN_LIST_MAX_LIMIT).default(RUN_LIST_DEFAULT_LIMIT),
});
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService({ ...app.container.evalDeps, logger: app.log });

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.object({ cases: z.array(EvalCaseRecord) }) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseSave, response: { 201: EvalCaseRecord } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalRunStarted } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.startRun(workspaceId, req.params.id);
      reply.status(202);
      return started;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: RunsQuery, response: { 200: EvalRunsOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.params.id, req.query.limit);
    },
  );

  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalDashboardOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.dashboard(workspaceId);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseSave, response: { 200: EvalCaseRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id);
    reply.status(204);
  });

  app.get(
    '/agents/:id/eval-trend',
    { schema: { params: IdParams, response: { 200: EvalTrend } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.trend(workspaceId, req.params.id);
    },
  );
}
