import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { TourGenerationStarted, TourRead } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding tour (SPEC-11).
 *   GET  /repos/:id/onboarding           → the stored tour (or null) + the generation state
 *   POST /repos/:id/onboarding/generate  → start a generation in the background (202); 409 when one is running
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService({ ...app.container.onboardingDeps, logger: app.log });

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: TourRead } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.read(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 202: TourGenerationStarted } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.start(workspaceId, req.params.id);
      reply.status(202);
      return started;
    },
  );
}
