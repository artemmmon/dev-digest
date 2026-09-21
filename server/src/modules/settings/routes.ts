import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConnTestRequest,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { SettingsService } from './service.js';

/**
 * F1 — settings module (HTTP only; logic in ./service.ts, SQL in ./repository.ts).
 *   GET  /settings                 → current non-secret prefs
 *   PUT  /settings                 → upsert prefs (key/value rows)
 *   GET  /settings/secrets-status  → which provider keys are configured (booleans)
 *   POST /settings/test-connection → test a provider key (OpenAI/Anthropic/OpenRouter/GitHub)
 *
 * Secrets are NOT stored in the DB — only non-secret prefs. Keys live in the
 * SecretsProvider; values are never returned.
 */
export default async function settingsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SettingsService({
    settings: container.settingsRepo,
    secrets: container.secrets,
    clients: {
      github: () => container.github(),
      githubWithToken: (token) => container.githubWithToken(token),
      llm: (id) => container.llm(id),
      llmWithKey: (id, key) => container.llmWithKey(id, key),
      invalidate: () => container.invalidateSecretCaches(),
    },
  });

  app.get('/settings', { schema: { response: { 200: Settings } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId);
  });

  app.get(
    '/settings/secrets-status',
    { schema: { response: { 200: SecretsStatus } } },
    async (req) => {
      await getContext(container, req);
      return service.secretsStatus();
    },
  );

  app.put(
    '/settings',
    { schema: { body: SettingsUpdate, response: { 200: Settings } } },
    async (req) => {
      const { workspaceId, userId } = await getContext(container, req);
      return service.update(workspaceId, userId, req.body);
    },
  );

  app.post(
    '/settings/test-connection',
    {
      schema: { body: ConnTestRequest, response: { 200: ConnTestResult } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    // No getContext: the test touches only the secrets store and the provider,
    // and must work before the workspace is seeded.
    async (req) => service.testConnection(req.body.provider, req.body.key),
  );
}
