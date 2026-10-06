import { describe, it, expect } from 'vitest';
import {
  isExampleEnvFile,
  isReadable,
  normalizePath,
  pickCandidates,
  pickRunFiles,
} from '../src/modules/onboarding/sources.js';

/**
 * SPEC-11 source choice: which files a generation may read (AC-33, OQ-5, EC-16) and where the
 * candidates come from when the index ranked nothing (AC-31, EC-8). Pure paths in, paths out.
 */

describe('environment files (AC-33, EC-16, OQ-5)', () => {
  it('AC-33, EC-16: real environment files are not readable', () => {
    for (const p of ['.env', '.env.local', '.env.production', 'server/.env', 'config/prod.env', 'apps/web/.env.staging']) {
      expect(isReadable(p), p).toBe(false);
    }
  });

  it('OQ-5: only names ending in .example, .sample or .template count as example environment files', () => {
    for (const p of ['.env.example', 'server/.env.sample', 'api/.env.template', '.env.local.example']) {
      expect(isExampleEnvFile(p), p).toBe(true);
      expect(isReadable(p), p).toBe(true);
    }
    for (const p of ['.env', '.env.example.bak', '.env.local']) {
      expect(isExampleEnvFile(p), p).toBe(false);
    }
  });

  it('AC-33: keys and credentials are never readable either', () => {
    for (const p of ['certs/server.pem', 'deploy/id_rsa', '.npmrc', 'secrets/prod.json', 'android/app/google-services.json']) {
      expect(isReadable(p), p).toBe(false);
    }
  });

  it('AC-33, EC-16: pickRunFiles never returns a real environment file, but keeps the example one', () => {
    const picked = pickRunFiles(['.env', '.env.local', '.env.example', 'README.md', 'package.json']);
    expect(picked).not.toContain('.env');
    expect(picked).not.toContain('.env.local');
    expect(picked).toContain('.env.example');
  });

  it('AC-33: pickCandidates never offers a real environment file, ranked or not', () => {
    const tracked = ['.env', 'src/a.ts', 'src/b.ts'];
    const ranked = pickCandidates({ topFiles: ['.env', 'src/a.ts'], chains: [['.env', 'src/a.ts', 'src/b.ts']], tracked });
    expect(ranked.files).toEqual(['src/a.ts']);
    expect(ranked.chains).toEqual([['src/a.ts', 'src/b.ts']]);
    const fallback = pickCandidates({ topFiles: [], chains: [], tracked });
    expect(fallback.files).not.toContain('.env');
  });
});

describe('run files', () => {
  it('orders README, then manifests, then compose files, then example env files', () => {
    const picked = pickRunFiles([
      '.env.example',
      'docker-compose.yml',
      'package.json',
      'src/index.ts',
      'README.md',
    ]);
    expect(picked).toEqual(['README.md', 'package.json', 'docker-compose.yml', '.env.example']);
  });

  it('leaves out files deeper than two directories and anything in a junk directory', () => {
    const picked = pickRunFiles(['a/b/c/package.json', 'node_modules/x/package.json', 'package.json']);
    expect(picked).toEqual(['package.json']);
  });

  it('EC-9: a repository with no README and no manifest has no run files', () => {
    expect(pickRunFiles(['src/a.ts', 'src/b.ts'])).toEqual([]);
  });
});

describe('pickCandidates — ranked files', () => {
  it('keeps ranked files that are tracked, in rank order, and drops untracked ones', () => {
    const { files } = pickCandidates({
      topFiles: ['src/b.ts', 'src/gone.ts', 'src/a.ts'],
      chains: [],
      tracked: ['src/a.ts', 'src/b.ts'],
    });
    expect(files).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('drops a chain that is left with fewer than two tracked files', () => {
    const { chains } = pickCandidates({
      topFiles: ['src/a.ts'],
      chains: [['src/a.ts', 'src/gone.ts'], ['src/a.ts', 'src/b.ts']],
      tracked: ['src/a.ts', 'src/b.ts'],
    });
    expect(chains).toEqual([['src/a.ts', 'src/b.ts']]);
  });
});

describe('pickCandidates — no ranked files (AC-31, EC-8)', () => {
  const tracked = [
    'README.md',
    'pubspec.yaml',
    'lib/main.dart',
    'lib/src/deep/widget.dart',
    'package-lock.json',
    'docs/guide.md',
  ];

  it('AC-31, EC-8: falls back to the README, the manifests and tracked source files', () => {
    const { files } = pickCandidates({ topFiles: [], chains: [], tracked });
    expect(files).toContain('README.md');
    expect(files).toContain('pubspec.yaml');
    expect(files).toContain('lib/main.dart');
    expect(files).toContain('lib/src/deep/widget.dart');
  });

  it('AC-31: fallback files are all tracked, and lockfiles / non-source files are not offered', () => {
    const { files } = pickCandidates({ topFiles: [], chains: [], tracked });
    for (const f of files) expect(tracked).toContain(f);
    expect(files).not.toContain('package-lock.json');
    expect(files).not.toContain('docs/guide.md');
  });

  it('AC-31: ranked files that are all untracked count as no ranked files', () => {
    const { files } = pickCandidates({ topFiles: ['ghost.ts'], chains: [], tracked });
    expect(files).toContain('README.md');
    expect(files).not.toContain('ghost.ts');
  });

  it('AC-31: shallow source files come before deep ones', () => {
    const { files } = pickCandidates({ topFiles: [], chains: [], tracked });
    expect(files.indexOf('lib/main.dart')).toBeLessThan(files.indexOf('lib/src/deep/widget.dart'));
  });

  it('AC-31: an empty tracked list yields no candidates and does not throw', () => {
    expect(pickCandidates({ topFiles: [], chains: [], tracked: [] })).toEqual({ files: [], chains: [] });
  });
});

describe('normalizePath', () => {
  it('cuts one leading "./" and surrounding whitespace, nothing else', () => {
    expect(normalizePath(' ./src/a.ts ')).toBe('src/a.ts');
    expect(normalizePath('src/./a.ts')).toBe('src/./a.ts');
    expect(normalizePath('/abs/a.ts')).toBe('/abs/a.ts');
  });
});
