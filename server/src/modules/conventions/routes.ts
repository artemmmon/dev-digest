import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCandidate,
  ConventionIds,
  ConventionList,
  ConventionPatch,
  ConventionScanResult,
  ConventionSkillCreate,
  ConventionSkillCreated,
  ConventionSkillDraft,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions extractor (L02 homework).
 *   GET   /repos/:id/conventions                  → candidates (not rejected) + last scan
 *   POST  /repos/:id/conventions/extract          → run a scan (synchronous, one per repo at a time)
 *   PATCH /repos/:id/conventions/:conventionId    → accept / reject / undo / reword one candidate
 *   POST  /repos/:id/conventions/skill-draft      → skill text built from accepted candidates; saves nothing
 *   POST  /repos/:id/conventions/skills           → create the skill (+ optionally bind it to an agent)
 */

const ConventionParams = z.object({ id: z.string().uuid(), conventionId: z.string().uuid() });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService({ ...app.container.conventionsDeps, logger: app.log });

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 200: ConventionScanResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionParams, body: ConventionPatch, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.patch(workspaceId, req.params.id, req.params.conventionId, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, body: ConventionIds, response: { 200: ConventionSkillDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skills',
    { schema: { params: IdParams, body: ConventionSkillCreate, response: { 201: ConventionSkillCreated } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );
}
