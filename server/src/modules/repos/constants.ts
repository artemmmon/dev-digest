/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */

/** JobRunner kind for the asynchronous `git clone` job. */
export { CLONE_JOB_KIND } from '../_shared/ports.js';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/**
 * Parse `owner`/`repo` from a GitHub URL — supports both
 * `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo.git`.
 * Anchored on both ends and limited to GitHub's name alphabet: owner/name end up
 * in a filesystem path (`<cloneDir>/<owner>/<name>`), so `..` or a foreign host
 * must never get through.
 */
export const GITHUB_URL_REGEX =
  /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

/** Host every repo is cloned from. */
export const GITHUB_HTTPS_HOST = 'github.com';

/** Tunables of the repo-stack detector (`stack.ts`). Nothing here touches I/O. */

/** A language below this share of the repo's code files is noise, not a stack fact. */
export const MIN_LANGUAGE_SHARE = 0.02;
/** Longest `languages` array returned. */
export const MAX_LANGUAGES = 3;
/** Longest `packages` array returned. */
export const MAX_PACKAGES = 6;
/** Longest `frameworks` array returned (a monorepo's extra apps beyond the primary one). */
export const MAX_FRAMEWORKS = 4;
/** A manifest deeper than this many path segments is very unlikely to be the repo's own. */
export const MANIFEST_MAX_DEPTH = 3;
/** Manifests are cheap to read but a huge monorepo shouldn't mean hundreds of `readFile`s. */
export const MAX_MANIFESTS = 40;

/** Filenames the detector reads as manifests, and which framework rule handles each. */
export const MANIFEST_FILENAMES = [
  'pubspec.yaml',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
] as const;

/**
 * `package.json` → framework, checked in this order (first dependency found wins).
 * Node/React ecosystem names only — Node.js itself is the fallback when none match.
 */
export const NODE_FRAMEWORK_DEPS: readonly (readonly [string, string])[] = [
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['@angular/core', 'Angular'],
  ['expo', 'React Native'],
  ['react-native', 'React Native'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['@nestjs/core', 'NestJS'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
];

/**
 * Key packages worth naming in the stack label, by ecosystem, in priority order
 * (state management → DI → codegen → network → routing → storage → test). A
 * dependency not listed here is real but not distinctive enough to show.
 */
export const KEY_PACKAGES: Readonly<Record<'flutter' | 'node', readonly string[]>> = {
  flutter: [
    'flutter_bloc',
    'bloc',
    'hydrated_bloc',
    'flutter_riverpod',
    'hooks_riverpod',
    'riverpod',
    'provider',
    'get',
    'mobx',
    'get_it',
    'injectable',
    'freezed',
    'freezed_annotation',
    'json_serializable',
    'equatable',
    'dio',
    'retrofit',
    'http',
    'go_router',
    'auto_route',
    'drift',
    'hive',
    'isar',
    'sqflite',
    'firebase_core',
    'firebase_auth',
    'firebase_analytics',
    'firebase_crashlytics',
    'firebase_messaging',
    'cloud_firestore',
    'bloc_test',
    'mocktail',
  ],
  node: [
    'zod',
    'drizzle-orm',
    'prisma',
    '@tanstack/react-query',
    '@reduxjs/toolkit',
    'tailwindcss',
    'vitest',
    'jest',
    'playwright',
  ],
};

/** Package names that mean the same dependency under different pub.dev names. */
export const PACKAGE_ALIASES: Readonly<Record<string, string>> = {
  flutter_riverpod: 'riverpod',
  hooks_riverpod: 'riverpod',
  freezed_annotation: 'freezed',
  firebase_core: 'firebase',
  firebase_auth: 'firebase',
  firebase_analytics: 'firebase',
  firebase_crashlytics: 'firebase',
  firebase_messaging: 'firebase',
  cloud_firestore: 'firebase',
};
