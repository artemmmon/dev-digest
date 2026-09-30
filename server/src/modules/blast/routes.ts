import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast radius (HTTP only — logic in ./service.ts, SQL in ./repository.ts).
 *   GET /pulls/:id/blast → the PR's precomputed repo-intel blast radius plus
 *                          index state, limits and counts. Never calls a model
 *                          and never parses the clone.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService({ ...container.blastDeps, log: app.log });

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
