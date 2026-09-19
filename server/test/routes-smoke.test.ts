import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import type { GitHubClient, SecretKey, SecretsProvider } from '@devdigest/shared';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/** In-memory secrets store that records writes (MockSecretsProvider is read-only). */
function recordingSecrets(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const secrets: SecretsProvider = {
    get: async (key: SecretKey) => store[key as string],
    set: async (key: SecretKey, value: string) => {
      store[key as string] = value;
    },
  };
  return { secrets, store };
}

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('POST /settings/test-connection keeps the old key when the new one fails', async () => {
    const { secrets, store } = recordingSecrets({ GITHUB_TOKEN: 'ghp_working' });
    const failing = {
      currentLogin: async () => {
        throw new Error('Bad credentials');
      },
    } as unknown as GitHubClient;
    const app = await buildApp({ config, overrides: { secrets, github: failing } });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github', key: 'ghp_typo' },
    });
    expect(res.json()).toMatchObject({ ok: false, message: 'Bad credentials' });
    expect(store.GITHUB_TOKEN).toBe('ghp_working');
    await app.close();
  });

  it('POST /settings/test-connection saves the new key once it passes', async () => {
    const { secrets, store } = recordingSecrets();
    const app = await buildApp({
      config,
      overrides: { secrets, github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github', key: 'ghp_new' },
    });
    expect(res.json().ok).toBe(true);
    expect(store.GITHUB_TOKEN).toBe('ghp_new');
    await app.close();
  });

  it.each(['https://github.com/../x', 'https://evil.example/github.com/a/b'])(
    'POST /repos rejects %s with 422',
    async (url) => {
      const app = await buildApp({ config });
      const res = await app.inject({ method: 'POST', url: '/repos', payload: { url } });
      expect(res.statusCode).toBe(422);
      await app.close();
    },
  );

  it('hides the message of an unmapped 5xx outside development', async () => {
    const app = await buildApp({ config });
    app.get('/boom', async () => {
      throw new Error('password authentication failed for user "devdigest"');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({ code: 'internal_error', message: 'Internal error' });
    await app.close();
  });
});
