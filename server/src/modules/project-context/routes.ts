import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProjectDocumentContent, ProjectDocumentList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Project context module (SPEC-10).
 *   GET /repos/:id/context          → the repository's project documents (path, type, tokens, used_by)
 *   GET /repos/:id/context/content  → the text of one of them (?path=)
 */

const ContentQuery = z.object({ path: z.string().min(1).max(4096) });

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.projectContextService;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectDocumentList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const list = await service.list(workspaceId, req.params.id);
      if (!list) throw new NotFoundError('Repository not found');
      return list;
    },
  );

  app.get(
    '/repos/:id/context/content',
    {
      schema: { params: IdParams, querystring: ContentQuery, response: { 200: ProjectDocumentContent } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const doc = await service.content(workspaceId, req.params.id, req.query.path);
      if (!doc) throw new NotFoundError('Document not found');
      return doc;
    },
  );
}
