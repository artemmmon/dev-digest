import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';

/** Secrets: stored keys beat env, env is the fallback, files are private, a bad file is not fatal. */

describe('LocalSecretsProvider', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'devdigest-secrets-'));
    file = join(dir, 'nested', 'secrets.json');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to the environment when nothing is stored', async () => {
    const secrets = new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' });
    expect(await secrets.get('OPENAI_API_KEY')).toBe('sk-env');
    expect(await secrets.get('ANTHROPIC_API_KEY')).toBeUndefined();
  });

  it('a stored key wins over the environment, and survives a restart', async () => {
    const first = new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' });
    await first.set('OPENAI_API_KEY', 'sk-ui');
    expect(await first.get('OPENAI_API_KEY')).toBe('sk-ui');

    const restarted = new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' });
    expect(await restarted.get('OPENAI_API_KEY')).toBe('sk-ui');
  });

  it('writes the file for the owner only, creating its directory', async () => {
    await new LocalSecretsProvider(file, {}).set('OPENROUTER_API_KEY', 'or-1');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ OPENROUTER_API_KEY: 'or-1' });
  });

  it('keeps the other keys when one is set', async () => {
    const secrets = new LocalSecretsProvider(file, {});
    await secrets.set('OPENAI_API_KEY', 'a');
    await secrets.set('ANTHROPIC_API_KEY', 'b');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      OPENAI_API_KEY: 'a',
      ANTHROPIC_API_KEY: 'b',
    });
  });

  it('GITHUB_TOKEN falls back to the legacy GITHUB_PAT, preferring GITHUB_TOKEN', async () => {
    expect(await new LocalSecretsProvider(file, { GITHUB_PAT: 'pat' }).get('GITHUB_TOKEN')).toBe('pat');
    expect(
      await new LocalSecretsProvider(file, { GITHUB_TOKEN: 'tok', GITHUB_PAT: 'pat' }).get('GITHUB_TOKEN'),
    ).toBe('tok');
  });

  it('treats a corrupt or non-object file as "nothing stored"', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'nested'), { recursive: true });
    await writeFile(file, '{not json');
    expect(await new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' }).get('OPENAI_API_KEY')).toBe('sk-env');
    await writeFile(file, 'null');
    expect(await new LocalSecretsProvider(file, { OPENAI_API_KEY: 'sk-env' }).get('OPENAI_API_KEY')).toBe('sk-env');
  });
});
