import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, access, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepoInput } from '@devdigest/shared';
import { parseRepoUrl, githubCloneUrl } from '../src/modules/repos/helpers.js';
import { simpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/**
 * owner/name from a repo URL become a filesystem path (`<cloneDir>/<owner>/<name>`)
 * and `clone()` deletes a stale destination, so the URL is a security boundary:
 * only github.com, only GitHub's name alphabet, never `..`.
 */

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/acme/widgets', 'acme', 'widgets'],
    ['https://github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/acme/widgets/', 'acme', 'widgets'],
    ['https://github.com/vercel/next.js', 'vercel', 'next.js'],
    ['git@github.com:acme/widgets.git', 'acme', 'widgets'],
    ['  https://github.com/acme/widgets  ', 'acme', 'widgets'],
  ])('parses %s', (url, owner, name) => {
    expect(parseRepoUrl(url)).toEqual({ owner, name });
  });

  it.each([
    'https://github.com/../x',
    'https://github.com/acme/..',
    'https://github.com/acme/../../etc',
    'https://evil.example/github.com/acme/widgets',
    'https://github.com.evil.example/acme/widgets',
    'https://github.com/acme/widgets/tree/main',
    'https://github.com/acme/widgets?x=1',
    'file:///etc/passwd',
  ])('rejects %s', (url) => {
    expect(() => parseRepoUrl(url)).toThrow(/Could not parse/);
  });
});

describe('RepoInput contract', () => {
  it('accepts a github.com https URL', () => {
    expect(RepoInput.safeParse({ url: 'https://github.com/acme/widgets' }).success).toBe(true);
  });

  it.each([
    'https://github.com/../x',
    'https://evil.example/github.com/acme/widgets',
    'http://github.com/acme/widgets',
    'git@github.com:acme/widgets.git',
  ])('rejects %s', (url) => {
    expect(RepoInput.safeParse({ url }).success).toBe(false);
  });
});

describe('githubCloneUrl', () => {
  it('always points at github.com over https', () => {
    expect(githubCloneUrl('acme', 'widgets')).toBe('https://github.com/acme/widgets.git');
  });
});

describe('SimpleGitClient path confinement', () => {
  it('refuses a clone path outside the clone dir and leaves siblings alone', async () => {
    const base = await mkdtemp(join(tmpdir(), 'devdigest-git-'));
    try {
      const cloneDir = join(base, 'clones');
      const victim = join(base, 'victim');
      await mkdir(victim, { recursive: true });
      await writeFile(join(victim, 'keep.txt'), 'x');

      const git = new SimpleGitClient(cloneDir);
      expect(() => git.clonePathFor({ owner: '..', name: 'victim' })).toThrow(/escapes/);
      await expect(
        git.clone({ owner: '..', name: 'victim' }, 'https://github.com/a/b.git'),
      ).rejects.toThrow(/escapes/);
      await expect(access(join(victim, 'keep.txt'))).resolves.toBeUndefined();
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('refuses to read a file outside the clone', async () => {
    const git = new SimpleGitClient('/tmp/devdigest-clones');
    await expect(
      git.readFile({ owner: 'acme', name: 'widgets' }, '../../../etc/passwd'),
    ).rejects.toThrow(/escapes/);
  });
});

describe('SimpleGitClient token handling', () => {
  const TOKEN = 'ghp_test_token_123';

  it('never writes the token into the clone config', async () => {
    const base = await mkdtemp(join(tmpdir(), 'devdigest-git-'));
    try {
      // a local "remote" with one commit — no network involved
      const origin = join(base, 'origin');
      await mkdir(origin);
      const o = simpleGit(origin);
      await o.init();
      await writeFile(join(origin, 'README.md'), 'hi');
      await o.add('.');
      await o.addConfig('user.email', 't@t');
      await o.addConfig('user.name', 't');
      await o.commit('init');

      const git = new SimpleGitClient(join(base, 'clones'), async () => TOKEN);
      const { path } = await git.clone({ owner: 'acme', name: 'widgets' }, `file://${origin}`);

      const config = await readFile(join(path, '.git', 'config'), 'utf8');
      expect(config).not.toContain(TOKEN);
      expect(config.toLowerCase()).not.toContain('extraheader');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('strips a token an older clone stored in origin, and keeps it out of errors', async () => {
    const base = await mkdtemp(join(tmpdir(), 'devdigest-git-'));
    try {
      const clone = join(base, 'clones', 'acme', 'widgets');
      await mkdir(clone, { recursive: true });
      const g = simpleGit(clone);
      await g.init();
      // pre-header-auth clones kept the PAT in the remote URL; port 9 refuses fast
      await g.addRemote('origin', `https://x-access-token:${TOKEN}@127.0.0.1:9/acme/widgets.git`);

      const git = new SimpleGitClient(join(base, 'clones'), async () => TOKEN);
      const err = await git
        .clone({ owner: 'acme', name: 'widgets' }, 'https://github.com/acme/widgets.git')
        .catch((e: unknown) => e as Error);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain(TOKEN);
      expect((await g.remote(['get-url', 'origin']))?.trim()).toBe(
        'https://127.0.0.1:9/acme/widgets.git',
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

