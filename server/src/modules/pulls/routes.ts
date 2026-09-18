import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module (HTTP only; logic in ./service.ts, SQL in ./repository.ts).
 *   GET  /repos/:id/pulls    → PRs of a repo, synced from GitHub when a token is
 *                              set, with latest-round cost/score/findings
 *   GET  /pulls/:id          → full PR detail (files, commits, body, linked issue)
 *   GET  /pulls/:id/comments → inline review comments (live from GitHub)
 *   POST /pulls/:id/comments → post an inline comment
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService({
    pulls: container.pullsRepo,
    github: () => container.github(),
    log: app.log,
  });

  app.get(
    '/repos/:id/pulls',
    { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listForRepo(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id',
    { schema: { params: IdParams, response: { 200: PrDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.detail(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams, response: { 200: z.array(PrReviewComment) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput, response: { 200: PrReviewComment } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
