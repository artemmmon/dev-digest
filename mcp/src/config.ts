/**
 * Startup configuration, read from the environment once. The MCP holds no secrets:
 * its only outbound target is the local DevDigest API, and that must be loopback.
 */

export const DEFAULT_API_URL = 'http://localhost:3001';
export const DEFAULT_MAX_WAIT_S = 90;
export const MIN_MAX_WAIT_S = 10;
export const MAX_MAX_WAIT_S = 600;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface McpConfig {
  /** Origin of the DevDigest API, e.g. `http://localhost:3001` (no path, no trailing slash). */
  apiUrl: string;
  /** How long `run_agent_on_pr` waits for a review before answering `running`. */
  maxWaitS: number;
}

/** Thrown at startup for a bad environment; the message is safe to print to stderr. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function parseApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(
      `DEVDIGEST_API_URL is not a valid URL (expected e.g. ${DEFAULT_API_URL}).`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('DEVDIGEST_API_URL must use http or https.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ConfigError(
      'DEVDIGEST_API_URL must point at this machine (localhost, 127.0.0.1 or [::1]); ' +
        'the DevDigest API has no authentication.',
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new ConfigError('DEVDIGEST_API_URL must not contain credentials.');
  }
  return url.origin;
}

function parseMaxWait(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_WAIT_S;
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || n < MIN_MAX_WAIT_S || n > MAX_MAX_WAIT_S) {
    throw new ConfigError(
      `DEVDIGEST_MCP_MAX_WAIT_S must be an integer from ${MIN_MAX_WAIT_S} to ${MAX_MAX_WAIT_S} (default ${DEFAULT_MAX_WAIT_S}).`,
    );
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const rawUrl = env.DEVDIGEST_API_URL?.trim();
  return {
    apiUrl: parseApiUrl(rawUrl ? rawUrl : DEFAULT_API_URL),
    maxWaitS: parseMaxWait(env.DEVDIGEST_MCP_MAX_WAIT_S),
  };
}
