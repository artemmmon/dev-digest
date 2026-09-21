import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Skill,
  SkillAgentUse,
  SkillImportBody,
  SkillImportPreview,
  SkillInput,
  SkillVersion,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_IMPORT_BYTES } from './constants.js';
import { SkillsService } from './service.js';

/**
 * Skills module (L02).
 *   GET    /skills                 → list (workspace-scoped)
 *   GET    /skills/:id             → one skill
 *   GET    /skills/:id/versions    → saved bodies with their change messages, newest first
 *   GET    /skills/:id/agents      → agents that have the skill switched on
 *   POST   /skills                 → create
 *   PUT    /skills/:id             → edit (a changed body creates a new version)
 *   PATCH  /skills/:id/enabled     → global on/off
 *   DELETE /skills/:id             → delete (agent bindings cascade)
 *   POST   /skills/import/preview  → read a .md / .zip, return the extracted core; saves nothing
 */

const UpdateSkillBody = SkillInput.omit({ source: true })
  .partial()
  .extend({ message: z.string().trim().max(200).optional() });
const EnabledBody = z.object({ enabled: z.boolean() });

/** base64 inflates by 4/3; leave room for the JSON envelope. */
const IMPORT_BODY_LIMIT = Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + 4096;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService({
    skills: app.container.skillsRepo,
    archive: app.container.archive,
    usage: app.container.agentsRepo,
    tokenizer: app.container.tokenizer,
  });

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.versions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.get(
    '/skills/:id/agents',
    { schema: { params: IdParams, response: { 200: z.array(SkillAgentUse) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agents = await service.agentsUsing(workspaceId, req.params.id);
      if (!agents) throw new NotFoundError('Skill not found');
      return agents;
    },
  );

  app.post(
    '/skills',
    { schema: { body: SkillInput, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.create(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.patch(
    '/skills/:id/enabled',
    { schema: { params: IdParams, body: EnabledBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.setEnabled(workspaceId, req.params.id, req.body.enabled);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.post(
    '/skills/import/preview',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      schema: { body: SkillImportBody, response: { 200: SkillImportPreview } },
    },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );
}
