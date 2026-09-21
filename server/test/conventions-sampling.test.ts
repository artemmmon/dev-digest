import { describe, it, expect } from 'vitest';
import {
  clipToChars,
  numberLines,
  pickConfigFiles,
  pickFallbackSamples,
  pickTestSamples,
  summarizePackageJson,
  treeSummary,
} from '../src/modules/conventions/sampling.js';

const TREE = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  '.env',
  '.env.local',
  'README.md',
  'lib/main.dart',
  'lib/models/user.dart',
  'lib/models/user.g.dart',
  'lib/models/user.freezed.dart',
  'lib/services/api.dart',
  'test/user_test.dart',
  'test/api_test.dart',
  'pubspec.yaml',
  'analysis_options.yaml',
  'server/package.json',
  'server/src/app.ts',
  'server/src/app.test.ts',
  'server/src/routes/lineups.ts',
  'server/src/routes/maps.ts',
  'server/src/db/migrations/0001_init.ts',
  'server/dist/app.js',
  'server/node_modules/x/index.js',
  'server/vendor/lib.js',
  'server/src/keys/server.pem',
  'server/src/secrets.ts',
  'web/app.min.js',
  'web/src/index.tsx',
  'tools/gen.py',
  'server/src/deep/a/b/c/package.json',
];

describe('pickFallbackSamples', () => {
  it('keeps only hand-written source: no tests, generated, lockfiles, migrations, vendored, secrets', () => {
    const picked = pickFallbackSamples(TREE, 100);
    expect(picked.sort()).toEqual(
      [
        'lib/main.dart',
        'lib/models/user.dart',
        'lib/services/api.dart',
        'server/src/app.ts',
        'server/src/routes/lineups.ts',
        'server/src/routes/maps.ts',
        'tools/gen.py',
        'web/src/index.tsx',
      ].sort(),
    );
  });

  it('round-robins across top-level folders instead of draining the biggest one', () => {
    const picked = pickFallbackSamples(TREE, 3);
    const tops = new Set(picked.map((p) => p.split('/')[0]));
    expect(picked).toHaveLength(3);
    expect(tops.size).toBe(3);
  });

  it('skips excluded paths and returns fewer when the repo has fewer', () => {
    const exclude = new Set(['lib/main.dart']);
    const picked = pickFallbackSamples(['lib/main.dart', 'lib/a.dart'], 5, exclude);
    expect(picked).toEqual(['lib/a.dart']);
  });

  it('returns [] for n <= 0', () => {
    expect(pickFallbackSamples(TREE, 0)).toEqual([]);
  });

  it('spreads picks inside a folder rather than taking the first alphabetically', () => {
    const many = Array.from({ length: 20 }, (_, i) => `src/f${String(i).padStart(2, '0')}.ts`);
    const picked = pickFallbackSamples(many, 2);
    expect(picked).not.toEqual(['src/f00.ts', 'src/f01.ts']);
  });
});

describe('pickTestSamples', () => {
  it('returns test files only', () => {
    const picked = pickTestSamples(TREE, 5);
    expect(picked.sort()).toEqual(['server/src/app.test.ts', 'test/api_test.dart', 'test/user_test.dart']);
  });
});

describe('pickConfigFiles', () => {
  it('picks allowlisted configs, root first, depth <= 2, never env or lockfiles', () => {
    const picked = pickConfigFiles(TREE);
    expect(picked).toEqual([
      'package.json',
      'tsconfig.json',
      'pubspec.yaml',
      'analysis_options.yaml',
      'server/package.json',
    ]);
  });

  it('caps the number of files', () => {
    expect(pickConfigFiles(TREE, 2)).toEqual(['package.json', 'tsconfig.json']);
  });
});

describe('summarizePackageJson', () => {
  it('lists script names and dependency names, not versions or script bodies', () => {
    const out = summarizePackageJson(
      JSON.stringify({
        name: 'api',
        type: 'module',
        scripts: { test: 'vitest run --secret-flag', lint: 'eslint .' },
        dependencies: { fastify: '^5.0.0' },
        devDependencies: { vitest: '^2.0.0' },
        engines: { node: '>=22' },
      }),
    );
    expect(out).toContain('name: api');
    expect(out).toContain('scripts: test, lint');
    expect(out).toContain('dependencies: fastify');
    expect(out).toContain('devDependencies: vitest');
    expect(out).toContain('engines: node >=22');
    expect(out).not.toContain('secret-flag');
    expect(out).not.toContain('^5.0.0');
  });

  it('returns null for invalid JSON', () => {
    expect(summarizePackageJson('{nope')).toBeNull();
    expect(summarizePackageJson('[]')).toBeNull();
  });
});

describe('treeSummary', () => {
  it('counts files, top-level folders and extensions', () => {
    const out = treeSummary(['a.ts', 'src/b.ts', 'src/c.ts', 'docs/d.md']);
    expect(out).toContain('Tracked files: 4');
    expect(out).toContain('src/ (2)');
    expect(out).toContain('(root) (1)');
    expect(out).toContain('.ts 3');
  });
});

describe('numberLines', () => {
  it('prefixes 1-based numbers, aligned, and handles CRLF', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\r\n');
    const out = numberLines(lines).split('\n');
    expect(out[0]).toBe(' 1| l1');
    expect(out[9]).toBe('10| l10');
  });

  it('does not add a phantom line for a trailing newline', () => {
    expect(numberLines('a\nb\n')).toBe('1| a\n2| b');
  });
});

describe('clipToChars', () => {
  it('cuts at a line boundary and counts what was left out', () => {
    const text = ['aaaa', 'bbbb', 'cccc', 'dddd'].join('\n');
    expect(clipToChars(text, 100)).toEqual({ text, truncated: 0 });
    expect(clipToChars(text, 10)).toEqual({ text: 'aaaa\nbbbb', truncated: 2 });
  });

  it('always keeps at least one line', () => {
    expect(clipToChars('x'.repeat(50), 5).truncated).toBe(0);
  });
});
