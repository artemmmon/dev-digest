import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CiAgentOverview,
  CiInstallInput,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRunPage,
  CiRunsQuery,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ZIP_FILE_NAME } from './constants.js';
import { CiService } from './service.js';

/**
 * Export to CI (SPEC-15). Every route is workspace-scoped through `getContext`. No route
 * accepts a CI result: results enter only through the server's own pull from GitHub.
 *   GET  /agents/:id/ci          → installations (with `outdated`) + the 20 newest runs
 *   POST /agents/:id/ci/preview  → the generated files, the replaced agent, the secret status
 *   POST /agents/:id/ci/install  → commit to `devdigest/ci` and open or reuse the PR (10/min)
 *   POST /agents/:id/ci/zip      → record a manual installation, answer with the .zip (10/min)
 *   GET  /ci/runs                → CI runs, newest first, keyset pagination
 *   POST /ci/refresh             → ingest new workflow runs from GitHub (30/min)
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService({ ...app.container.ciDeps, log: app.log });

  app.get(
    '/agents/:id/ci',
    { schema: { params: IdParams, response: { 200: CiAgentOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.overview(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    {
      schema: { params: IdParams, body: CiInstallInput, response: { 200: CiInstallResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { result } = await service.install(workspaceId, req.params.id, req.body, 'pr');
      return result;
    },
  );

  app.post(
    '/agents/:id/ci/zip',
    {
      schema: { params: IdParams, body: CiInstallInput },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { zip } = await service.install(workspaceId, req.params.id, req.body, 'manual');
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${ZIP_FILE_NAME}"`)
        .send(Buffer.from(zip ?? new Uint8Array()));
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: CiRunsQuery, response: { 200: CiRunPage } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.query);
    },
  );

  app.post(
    '/ci/refresh',
    {
      schema: { body: CiRefreshInput.optional(), response: { 200: CiRefreshResult } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.body?.force ?? false);
    },
  );
}
