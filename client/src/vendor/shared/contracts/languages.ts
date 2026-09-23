/**
 * One extension → language table, shared by:
 *  - the client diff viewer (a language chip on each changed file, `FileCard`)
 *  - the server repo-stack detector (language-share computation, `modules/repos/stack.ts`)
 *  - the conventions extractor (re-exports the path-classification patterns below)
 *
 * Lives in the core so neither side has to import the other's module
 * (onion-architecture: arrows point inward only) — see `server/INSIGHTS.md`,
 * "a constant needed by both an adapter and a module goes in vendor/shared".
 */

/** `code` counts toward a repo's language shares; the rest is metadata, markup or data. */
export type LanguageKind = 'code' | 'markup' | 'config' | 'data' | 'doc';

export interface LanguageInfo {
  /** Short label for a UI chip, e.g. `dart`, `tsx`, `yaml`. */
  label: string;
  /** Full name for a tooltip/title, e.g. `Dart`, `TypeScript (TSX)`. */
  name: string;
  kind: LanguageKind;
}

/** Keyed by extension, lowercase, without the leading dot. */
export const LANGUAGE_BY_EXT: Readonly<Record<string, LanguageInfo>> = {
  dart: { label: 'dart', name: 'Dart', kind: 'code' },
  ts: { label: 'ts', name: 'TypeScript', kind: 'code' },
  tsx: { label: 'tsx', name: 'TypeScript (TSX)', kind: 'code' },
  js: { label: 'js', name: 'JavaScript', kind: 'code' },
  jsx: { label: 'jsx', name: 'JavaScript (JSX)', kind: 'code' },
  mjs: { label: 'js', name: 'JavaScript (ESM)', kind: 'code' },
  cjs: { label: 'js', name: 'JavaScript (CJS)', kind: 'code' },
  vue: { label: 'vue', name: 'Vue', kind: 'code' },
  svelte: { label: 'svelte', name: 'Svelte', kind: 'code' },
  py: { label: 'py', name: 'Python', kind: 'code' },
  go: { label: 'go', name: 'Go', kind: 'code' },
  rs: { label: 'rs', name: 'Rust', kind: 'code' },
  java: { label: 'java', name: 'Java', kind: 'code' },
  kt: { label: 'kt', name: 'Kotlin', kind: 'code' },
  kts: { label: 'kts', name: 'Kotlin Script', kind: 'code' },
  swift: { label: 'swift', name: 'Swift', kind: 'code' },
  rb: { label: 'rb', name: 'Ruby', kind: 'code' },
  php: { label: 'php', name: 'PHP', kind: 'code' },
  cs: { label: 'cs', name: 'C#', kind: 'code' },
  scala: { label: 'scala', name: 'Scala', kind: 'code' },
  c: { label: 'c', name: 'C', kind: 'code' },
  cc: { label: 'cpp', name: 'C++', kind: 'code' },
  cpp: { label: 'cpp', name: 'C++', kind: 'code' },
  h: { label: 'h', name: 'C/C++ header', kind: 'code' },
  hpp: { label: 'hpp', name: 'C++ header', kind: 'code' },
  ex: { label: 'ex', name: 'Elixir', kind: 'code' },
  exs: { label: 'ex', name: 'Elixir script', kind: 'code' },
  sh: { label: 'sh', name: 'Shell', kind: 'code' },
  bash: { label: 'sh', name: 'Bash', kind: 'code' },
  sql: { label: 'sql', name: 'SQL', kind: 'code' },
  graphql: { label: 'graphql', name: 'GraphQL', kind: 'code' },
  gql: { label: 'graphql', name: 'GraphQL', kind: 'code' },
  proto: { label: 'proto', name: 'Protocol Buffers', kind: 'code' },
  css: { label: 'css', name: 'CSS', kind: 'markup' },
  scss: { label: 'scss', name: 'SCSS', kind: 'markup' },
  less: { label: 'less', name: 'Less', kind: 'markup' },
  html: { label: 'html', name: 'HTML', kind: 'markup' },
  xml: { label: 'xml', name: 'XML', kind: 'markup' },
  arb: { label: 'arb', name: 'ARB (Flutter localization)', kind: 'markup' },
  svg: { label: 'svg', name: 'SVG', kind: 'markup' },
  json: { label: 'json', name: 'JSON', kind: 'data' },
  yaml: { label: 'yaml', name: 'YAML', kind: 'config' },
  yml: { label: 'yaml', name: 'YAML', kind: 'config' },
  toml: { label: 'toml', name: 'TOML', kind: 'config' },
  ini: { label: 'ini', name: 'INI', kind: 'config' },
  env: { label: 'env', name: 'Env file', kind: 'config' },
  gradle: { label: 'gradle', name: 'Gradle build script', kind: 'config' },
  lock: { label: 'lock', name: 'Lockfile', kind: 'config' },
  md: { label: 'md', name: 'Markdown', kind: 'doc' },
  mdx: { label: 'md', name: 'MDX', kind: 'doc' },
  txt: { label: 'txt', name: 'Text', kind: 'doc' },
};

/** Keyed by exact basename — checked before the extension table. */
export const LANGUAGE_BY_FILENAME: Readonly<Record<string, LanguageInfo>> = {
  'pubspec.yaml': { label: 'pubspec', name: 'Flutter/Dart package manifest', kind: 'config' },
  'pubspec.lock': { label: 'lock', name: 'Dart lockfile', kind: 'config' },
  'analysis_options.yaml': { label: 'lint', name: 'Dart analyzer config', kind: 'config' },
  'package.json': { label: 'package', name: 'npm package manifest', kind: 'config' },
  Dockerfile: { label: 'docker', name: 'Dockerfile', kind: 'config' },
  Podfile: { label: 'pod', name: 'CocoaPods manifest', kind: 'config' },
  Makefile: { label: 'make', name: 'Makefile', kind: 'config' },
  'build.gradle': { label: 'gradle', name: 'Gradle build script', kind: 'config' },
  'build.gradle.kts': { label: 'gradle', name: 'Gradle build script (Kotlin DSL)', kind: 'config' },
};

/** Basename of a path, without any directory component. */
function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Language/format of a path, or `null` for an extensionless or unrecognised file. */
export function languageOf(path: string): LanguageInfo | null {
  const base = basenameOf(path);
  const byName = LANGUAGE_BY_FILENAME[base];
  if (byName) return byName;

  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? null;
}

/**
 * Files generated by a build step: never authored by hand, so a review agent
 * should never see them and a diff-viewer chip should mark them, not colour them
 * as if they were source. Covers Dart/Flutter codegen (`build_runner`, protobuf).
 */
export const GENERATED_FILE_PATTERN =
  /(\.g\.dart|\.freezed\.dart|\.gr\.dart|\.mocks\.dart|\.gen\.dart|\.config\.dart|\.pb\.dart|\.pbenum\.dart|\.pbjson\.dart|\.pbserver\.dart|\.min\.\w+|\.bundle\.\w+|\.generated\.\w+|\.pb\.\w+|_pb2\.py|\.d\.ts)$/;

/** True for a path a build step writes, never a person. */
export function isGeneratedPath(path: string): boolean {
  return GENERATED_FILE_PATTERN.test(path);
}

/**
 * Top-level folders that hold framework scaffolding (Flutter/RN platform shells; not
 * `web/`, which is often a real app). The conventions extractor samples these only when
 * hand-written code alone can't fill its quota; the repo-stack detector drops them so a
 * small Flutter app's Kotlin/Swift runner shell doesn't outweigh its Dart.
 */
export const SCAFFOLD_DIR_PATTERN = /^(android|ios|macos|windows|linux)\//;

/** Directories that never hold hand-written code worth learning from or counting. */
export const JUNK_DIR_PATTERN =
  /(^|\/)(node_modules|vendor|dist|build|out|target|coverage|\.next|\.dart_tool|\.git|\.idea|\.venv|venv|__pycache__|Pods|generated|third_party|clones|migrations?)\//;

export const LOCKFILE_PATTERN =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|npm-shrinkwrap\.json|Cargo\.lock|pubspec\.lock|go\.sum|poetry\.lock|Gemfile\.lock|composer\.lock|bun\.lockb?)$|\.lock$/;
