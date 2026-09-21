import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { loadConfig } from '../src/platform/config.js';

/** loadConfig reads only the env it is given, so every case passes an explicit object. */

describe('loadConfig', () => {
  it('has safe local defaults', () => {
    const c = loadConfig({});
    expect(c).toMatchObject({
      databaseUrl: 'postgres://devdigest:devdigest@localhost:5432/devdigest',
      apiPort: 3001,
      apiHost: 'localhost', // no auth: not reachable from the network by default
      webPort: 3000,
      nodeEnv: 'development',
      logLevel: 'info',
      embeddingsEnabled: false,
      repoIntelEnabled: true,
    });
    expect(c.webOrigin).toBe('http://localhost:3000');
    expect(c.cloneDir).toBe(join(homedir(), '.devdigest', 'workspace'));
  });

  it('reads ports, host and the CORS origin from the env', () => {
    const c = loadConfig({ API_PORT: '4001', API_HOST: '0.0.0.0', WEB_PORT: '4000' });
    expect(c.apiPort).toBe(4001);
    expect(c.apiHost).toBe('0.0.0.0');
    expect(c.webOrigin).toBe('http://localhost:4000');
  });

  it('resolves a relative clone dir against the working directory', () => {
    const c = loadConfig({ DEVDIGEST_CLONE_DIR: './clones' });
    expect(isAbsolute(c.cloneDir)).toBe(true);
    expect(c.cloneDir.endsWith('/clones')).toBe(true);
  });

  it('is quiet under test and treats an empty LOG_LEVEL as unset', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).logLevel).toBe('silent');
    expect(loadConfig({ LOG_LEVEL: '' }).logLevel).toBe('info');
    expect(loadConfig({ LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('only the exact string "false" turns repo-intel off, and only "true" turns embeddings on', () => {
    expect(loadConfig({ REPO_INTEL_ENABLED: 'false' }).repoIntelEnabled).toBe(false);
    expect(loadConfig({ REPO_INTEL_ENABLED: '0' }).repoIntelEnabled).toBe(true);
    expect(loadConfig({ EMBEDDINGS_ENABLED: 'true' }).embeddingsEnabled).toBe(true);
    expect(loadConfig({ EMBEDDINGS_ENABLED: '1' }).embeddingsEnabled).toBe(false);
  });

  it('rejects an invalid value instead of guessing', () => {
    expect(() => loadConfig({ API_PORT: 'not-a-port' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow();
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow();
  });
});
