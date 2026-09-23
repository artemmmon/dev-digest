import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Repo, RepoInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new RepoService({
    repos: container.reposRepo,
    git: container.git,
    jobs: container.jobs,
  });

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  // Best-effort catch-up for repos cloned before stack detection existed. Fire-and-
  // forget — must never delay boot or a request — and skipped under test so a suite's
  // fake git/store don't get background calls after the test has finished asserting.
  if (container.config.nodeEnv !== 'test') {
    service.backfillMissingStacks().catch((err) => {
      appBase.log.warn({ err: (err as Error).message }, 'repo-stack backfill failed (non-fatal)');
    });
  }

  app.post(
    '/repos',
    { schema: { body: RepoInput, response: { 200: Repo, 201: Repo } } },
    async (req, reply) => {
      const { workspaceId, userId } = await getContext(container, req);
      const { repo, created } = await service.add(workspaceId, userId, req.body.url);
      reply.status(created ? 201 : 200);
      return repo;
    },
  );

  app.get('/repos', { schema: { response: { 200: z.array(Repo) } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.refresh(workspaceId, req.params.id);
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
