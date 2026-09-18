import type { GitHubClient, LLMProvider, SecretsProvider } from '@devdigest/shared';

/** Ports of the settings module (onion-architecture: core declares, outer ring implements). */

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

export interface SettingsStore {
  list(workspaceId: string): Promise<SettingsRow[]>;
  /** Upsert every entry in one statement: all prefs are saved or none. */
  upsert(workspaceId: string, userId: string, entries: SettingsRow[]): Promise<void>;
}

export type LlmProviderId = 'openai' | 'anthropic' | 'openrouter';

/** Builds provider clients from the stored key or from a candidate key under test. */
export interface ProviderClients {
  github(): Promise<GitHubClient>;
  githubWithToken(token: string): GitHubClient;
  llm(id: LlmProviderId): Promise<LLMProvider>;
  llmWithKey(id: LlmProviderId, key: string): Promise<LLMProvider>;
  /** Drop cached clients after a key changed. */
  invalidate(): void;
}

export interface SettingsServiceDeps {
  settings: SettingsStore;
  secrets: SecretsProvider;
  clients: ProviderClients;
}
