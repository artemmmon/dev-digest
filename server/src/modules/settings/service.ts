import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';
import type { SettingsServiceDeps } from './ports.js';

/**
 * Non-secret workspace prefs, plus the API-key panel: which keys are set and
 * the connection test. Secret values never pass through here to the client.
 */
export class SettingsService {
  constructor(private deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.settings.list(workspaceId));
  }

  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    const entries = Object.entries(patch).map(([key, value]) => ({ key, value }));
    await this.deps.settings.upsert(workspaceId, userId, entries);
    return this.get(workspaceId);
  }

  /** Which provider keys are configured — booleans only, never the values. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider with a cheap live call. A key from the UI (BYO key) is tested
   * with a throwaway client and saved only if the test passes, so a typo never
   * replaces a working key. Without a key, the stored one is tested.
   */
  async testConnection(provider: ConnTestProvider, key?: string): Promise<ConnTestResult> {
    const { secrets, clients } = this.deps;
    if (key && !secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        const gh = key ? clients.githubWithToken(key) : await clients.github();
        message = `Connected as @${await gh.currentLogin()}`;
      } else {
        const llm = key ? await clients.llmWithKey(provider, key) : await clients.llm(provider);
        message = `OK — ${(await llm.listModels()).length} models available`;
      }
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
    if (key && secrets.set) {
      await secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
      clients.invalidate();
    }
    return { provider, ok: true, message };
  }
}
