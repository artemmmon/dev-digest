import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { toRepoDto } from '../repos/index.js';

/** Where clones live + a summary of the workspace's repos (local-only overview). */
const WorkspaceSummary = z.object({
  workspaceId: z.string(),
  cloneDir: z.string(),
  repos: z.array(
    z.object({
      id: z.string(),
      full_name: z.string(),
      clone_path: z.string().nullable(),
      last_polled_at: z.string().nullable(),
      cloned: z.boolean(),
    }),
  ),
});

/**
 * F1 — workspace manager.
 *   GET /workspace → workspace info + cloneDir + cloned repos summary
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/workspace', { schema: { response: { 200: WorkspaceSummary } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const repos = (await container.reposRepo.list(workspaceId)).map(toRepoDto);
    return {
      workspaceId,
      cloneDir: container.config.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        clone_path: r.clone_path,
        last_polled_at: r.last_polled_at,
        cloned: Boolean(r.clone_path),
      })),
    };
  });
}
