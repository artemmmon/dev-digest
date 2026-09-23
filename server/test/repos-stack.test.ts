/**
 * Repo-stack detector (`modules/repos/stack.ts`) — pure, no git, no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { detectStack, findManifestPaths } from '../src/modules/repos/stack.js';

const FLUTTER_PUBSPEC = `name: my_app
description: an app
dependencies:
  flutter:
    sdk: flutter
  flutter_bloc: ^8.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.0
`;

const DART_PUBSPEC = `name: my_pkg
dependencies:
  http: ^1.0.0
dev_dependencies:
  test: ^1.24.0
`;

function pkgJson(deps: Record<string, string>): string {
  return JSON.stringify({ name: 'x', dependencies: deps });
}

describe('detectStack — Flutter app with platform scaffold', () => {
  const files = [
    'pubspec.yaml',
    'lib/main.dart',
    'lib/models/user.dart',
    'lib/models/user.g.dart',
    'android/app/build.gradle',
    'android/app/src/main/kotlin/MainActivity.kt',
    'ios/Runner/AppDelegate.swift',
  ];
  const manifests = new Map([['pubspec.yaml', FLUTTER_PUBSPEC]]);
  const stack = detectStack(files, manifests);

  it('detects Flutter (not Dart) and does not double-count the android/ build.gradle', () => {
    expect(stack.frameworks).toEqual([{ name: 'Flutter', path: '' }]);
  });

  it('drops the android/ios scaffold and generated .g.dart from the language share', () => {
    expect(stack.languages).toEqual([{ name: 'Dart', share: 1 }]);
  });

  it('lists the key package but not build_runner (not in the allowlist)', () => {
    expect(stack.packages).toEqual(['flutter_bloc']);
  });
});

describe('detectStack — plain Dart package (no Flutter SDK dependency)', () => {
  it('detects Dart, not Flutter', () => {
    const files = ['pubspec.yaml', 'lib/my_pkg.dart', 'lib/src/util.dart'];
    const stack = detectStack(files, new Map([['pubspec.yaml', DART_PUBSPEC]]));
    expect(stack.frameworks).toEqual([{ name: 'Dart', path: '' }]);
    expect(stack.languages).toEqual([{ name: 'Dart', share: 1 }]);
    expect(stack.packages).toEqual(['http']);
  });
});

describe('detectStack — Next.js + Fastify monorepo (DevDigest-shaped)', () => {
  const files = [
    'client/src/app/page.tsx',
    'client/src/app/layout.tsx',
    'client/src/lib/utils.ts',
    'client/src/app/globals.css',
    'server/src/app.ts',
    'server/src/server.ts',
  ];
  const manifests = new Map([
    ['client/package.json', pkgJson({ next: '15.0.0', react: '19.0.0', '@tanstack/react-query': '5.0.0' })],
    ['server/package.json', pkgJson({ fastify: '5.0.0', zod: '3.0.0', 'drizzle-orm': '0.38.0' })],
  ]);
  const stack = detectStack(files, manifests);

  it('names Next.js and Fastify, ranking the one with more code first', () => {
    expect(stack.frameworks).toEqual([
      { name: 'Next.js', path: 'client' },
      { name: 'Fastify', path: 'server' },
    ]);
  });

  it('groups .ts/.tsx into one TypeScript share', () => {
    expect(stack.languages).toEqual([{ name: 'TypeScript', share: 1 }]);
  });

  it('combines packages across manifests in allowlist order', () => {
    expect(stack.packages).toEqual(['zod', 'drizzle-orm', '@tanstack/react-query']);
  });
});

describe('detectStack — empty / docs-only repo', () => {
  it('returns empty facts instead of guessing', () => {
    const stack = detectStack(['README.md', 'LICENSE'], new Map());
    expect(stack).toEqual({ frameworks: [], languages: [], packages: [] });
  });
});

describe('detectStack — package alias normalisation', () => {
  it('collapses riverpod and firebase variants to one canonical name each', () => {
    const pubspec = `dependencies:
  hooks_riverpod: ^2.0.0
  firebase_core: ^2.0.0
  firebase_auth: ^4.0.0
`;
    const stack = detectStack(['pubspec.yaml', 'lib/main.dart'], new Map([['pubspec.yaml', pubspec]]));
    expect(stack.packages).toEqual(['riverpod', 'firebase']);
  });
});

describe('detectStack — a real Android project (no Flutter anywhere)', () => {
  it('reports Android from build.gradle when there is no Flutter pubspec', () => {
    const files = ['android/build.gradle', 'app/src/main/java/com/example/Main.java'];
    const stack = detectStack(files, new Map([['android/build.gradle', '']]));
    expect(stack.frameworks).toEqual([{ name: 'Android', path: 'android' }]);
  });
});

describe('parsePubspec (via detectStack) — edge cases', () => {
  it('ignores dependency_overrides and tolerates comments/blank lines', () => {
    const pubspec = `name: x
# a comment

dependencies:
  dio: ^5.0.0
dependency_overrides:
  some_pkg:
    path: ../some_pkg
`;
    const stack = detectStack(['pubspec.yaml', 'lib/a.dart'], new Map([['pubspec.yaml', pubspec]]));
    expect(stack.packages).toEqual(['dio']);
  });
});

describe('findManifestPaths', () => {
  it('picks recognised manifest filenames, shallowest first, and skips junk dirs', () => {
    const files = [
      'server/package.json',
      'package.json',
      'node_modules/some-dep/package.json',
      'a/very/deeply/nested/example/pubspec.yaml',
      'README.md',
    ];
    expect(findManifestPaths(files)).toEqual(['package.json', 'server/package.json']);
  });
});
