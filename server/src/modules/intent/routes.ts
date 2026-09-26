import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntent, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR intent (L03).
 *   GET  /pulls/:id/intent  → the stored intent (or null) + stale flag; no LLM call
 *   POST /pulls/:id/intent  → derive now (create or re-derive); rate-limited (D1)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.intentService;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntent } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.derive(workspaceId, req.params.id, {
        onEvent: (kind, msg, data) => req.log.info({ kind, ...(data !== undefined ? { data } : {}) }, msg),
      });
    },
  );
}
