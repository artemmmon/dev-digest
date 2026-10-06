import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR brief (HTTP only — logic in ./service.ts, SQL in ./repository.ts).
 *   GET  /pulls/:id/brief  → the stored brief (or null) + stale flag; no model call
 *   POST /pulls/:id/brief  → generate now (create or regenerate); rate-limited
 * One service per app: it holds the in-flight map that makes a double click one model call.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService(container.briefDeps(app.log));

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBrief } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id);
    },
  );
}
