import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ apiUrl: 'http://localhost:3001', maxWaitS: 90 });
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '  ', DEVDIGEST_MCP_MAX_WAIT_S: '' })).toEqual({
      apiUrl: 'http://localhost:3001',
      maxWaitS: 90,
    });
  });

  it.each(['http://localhost:3001', 'http://127.0.0.1:4000', 'http://[::1]:3001', 'https://localhost'])(
    'accepts loopback %s',
    (url) => {
      expect(() => loadConfig({ DEVDIGEST_API_URL: url })).not.toThrow();
    },
  );

  it('keeps only the origin', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://localhost:3001/some/path/' }).apiUrl).toBe(
      'http://localhost:3001',
    );
  });

  it.each([
    'http://example.com',
    'http://10.0.0.5:3001',
    'http://0.0.0.0:3001',
    'http://localhost.evil.com',
    'http://localhost@evil.com',
    'http://user:pw@localhost:3001',
    'ftp://localhost',
    'file:///etc/passwd',
    'not a url',
    '${DEVDIGEST_API_URL:-http://localhost:3001}',
  ])('rejects %s', (url) => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: url })).toThrow(ConfigError);
  });

  it('enforces the wait bounds', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '10' }).maxWaitS).toBe(10);
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: '600' }).maxWaitS).toBe(600);
    for (const bad of ['9', '601', '1.5', 'abc', '-20', '1e2']) {
      expect(() => loadConfig({ DEVDIGEST_MCP_MAX_WAIT_S: bad })).toThrow(ConfigError);
    }
  });
});
