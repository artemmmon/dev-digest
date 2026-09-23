import {
  languageOf,
  JUNK_DIR_PATTERN,
  LOCKFILE_PATTERN,
  GENERATED_FILE_PATTERN,
  SCAFFOLD_DIR_PATTERN,
} from '@devdigest/shared';
import { parsePubspec, parsePackageJson, pythonFramework } from './manifests.js';
import {
  MANIFEST_FILENAMES,
  MANIFEST_MAX_DEPTH,
  MAX_MANIFESTS,
  MIN_LANGUAGE_SHARE,
  MAX_LANGUAGES,
  MAX_PACKAGES,
  MAX_FRAMEWORKS,
  NODE_FRAMEWORK_DEPS,
  KEY_PACKAGES,
  PACKAGE_ALIASES,
} from './constants.js';

/**
 * F1 — pure repo-stack detector: `files` (a `git ls-files` listing) and the text of
 * whatever manifests were found in it, in → framework/language/package facts, out.
 * All I/O (which files exist, reading a manifest) lives in the service; this module
 * never touches `GitClient`. `stack.test.ts` exercises it directly, no mocks needed.
 */

export interface DetectedFramework {
  name: string;
  path: string;
}
export interface DetectedLanguage {
  name: string;
  share: number;
}
export interface DetectedStack {
  frameworks: DetectedFramework[];
  languages: DetectedLanguage[];
  packages: string[];
}

/** Directory part of a repo-relative path, or `''` for a root-level file. */
function directoryOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depthOf(path: string): number {
  return path.split('/').length - 1;
}

/**
 * Which of `files` are worth reading as manifests: a recognised filename, shallow
 * enough to plausibly be the repo's own (not a fixture buried in `test/fixtures/…`),
 * capped so a huge monorepo can't turn detection into hundreds of `readFile` calls.
 * Shallowest paths win the cap, so the repo's real manifests are read before a
 * deeply-nested example project's.
 */
export function findManifestPaths(files: string[]): string[] {
  const filenames: readonly string[] = MANIFEST_FILENAMES;
  return files
    .filter((f) => filenames.includes(basenameOf(f)) && !JUNK_DIR_PATTERN.test(f))
    .filter((f) => depthOf(f) <= MANIFEST_MAX_DEPTH)
    .sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b))
    .slice(0, MAX_MANIFESTS);
}

/** TS/JS variants collapse to one language for the stack summary (the diff chip stays granular). */
const LANGUAGE_GROUP: Readonly<Record<string, string>> = {
  'TypeScript (TSX)': 'TypeScript',
  'JavaScript (JSX)': 'JavaScript',
  'JavaScript (ESM)': 'JavaScript',
  'JavaScript (CJS)': 'JavaScript',
};

function groupLanguageName(name: string): string {
  return LANGUAGE_GROUP[name] ?? name;
}

/** Regex matching `<root>/(android|ios|macos|windows|linux)/…` for one Flutter package root. */
function scaffoldPatternFor(root: string): RegExp {
  const suffix = SCAFFOLD_DIR_PATTERN.source.replace(/^\^/, '');
  const prefix = root ? `${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` : '';
  return new RegExp(`^${prefix}${suffix}`);
}

/** In allowlist priority order, the canonical name of each dependency present in `deps`. */
function collectPackages(deps: ReadonlySet<string>, allowlist: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const pkg of allowlist) {
    if (!deps.has(pkg)) continue;
    const canonical = PACKAGE_ALIASES[pkg] ?? pkg;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function detectStack(files: string[], manifests: ReadonlyMap<string, string>): DetectedStack {
  // ---- frameworks (one per manifest) + Flutter package roots (for the scaffold drop) ----
  const flutterRoots: string[] = [];
  const frameworks: DetectedFramework[] = [];

  for (const [path, content] of manifests) {
    const base = basenameOf(path);
    const dir = directoryOf(path);

    if (base === 'pubspec.yaml') {
      const { isFlutter } = parsePubspec(content);
      if (isFlutter) flutterRoots.push(dir);
      frameworks.push({ name: isFlutter ? 'Flutter' : 'Dart', path: dir });
    } else if (base === 'package.json') {
      const deps = new Set(parsePackageJson(content));
      const match = NODE_FRAMEWORK_DEPS.find(([dep]) => deps.has(dep));
      frameworks.push({ name: match ? match[1] : 'Node.js', path: dir });
    } else if (base === 'pyproject.toml' || base === 'requirements.txt') {
      frameworks.push({ name: pythonFramework(content), path: dir });
    } else if (base === 'go.mod') {
      frameworks.push({ name: 'Go', path: dir });
    } else if (base === 'Cargo.toml') {
      frameworks.push({ name: 'Rust', path: dir });
    } else if (base === 'build.gradle' || base === 'build.gradle.kts') {
      // Skip the Android build script Flutter itself generates under <root>/android —
      // it's the app's plumbing, not a second, hand-built Android project.
      const isFlutterScaffold = flutterRoots.some((root) => scaffoldPatternFor(root).test(`${dir}/`));
      if (!isFlutterScaffold) frameworks.push({ name: 'Android', path: dir });
    } else if (base === 'Package.swift') {
      frameworks.push({ name: 'Swift', path: dir });
    }
  }

  // Drop an exact (name, path) repeat — e.g. both pyproject.toml and requirements.txt in one dir.
  const dedupedFrameworks = frameworks.filter(
    (f, i) => frameworks.findIndex((g) => g.name === f.name && g.path === f.path) === i,
  );

  // ---- file classification, shared by framework ranking and language shares ----
  const isNoise = (path: string) =>
    JUNK_DIR_PATTERN.test(path) || LOCKFILE_PATTERN.test(path) || GENERATED_FILE_PATTERN.test(path);
  const codeFiles = files.filter((f) => !isNoise(f) && languageOf(f)?.kind === 'code');

  // Rank frameworks by code volume under their manifest's folder — frameworks[0] is
  // then "the app", and a monorepo's other manifests trail behind it.
  const codeCountUnder = (root: string) =>
    codeFiles.filter((f) => (root ? f.startsWith(`${root}/`) : true)).length;
  dedupedFrameworks.sort((a, b) => codeCountUnder(b.path) - codeCountUnder(a.path));

  // ---- language shares: drop each Flutter root's platform-runner shells first, so a
  // small app's Kotlin/Swift boilerplate doesn't outweigh its own Dart ----
  const languageFiles = codeFiles.filter(
    (f) => !flutterRoots.some((root) => scaffoldPatternFor(root).test(f)),
  );
  const counts = new Map<string, number>();
  for (const f of languageFiles) {
    const info = languageOf(f);
    if (!info) continue; // filtered to kind==='code' above, but keep this defensive
    const name = groupLanguageName(info.name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = languageFiles.length;
  const languages: DetectedLanguage[] = total === 0 ? [] : [...counts.entries()]
    .map(([name, count]) => ({ name, share: count / total }))
    .filter((l) => l.share >= MIN_LANGUAGE_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_LANGUAGES);

  // ---- packages, by ecosystem ----
  const flutterDeps = new Set<string>();
  const nodeDeps = new Set<string>();
  for (const [path, content] of manifests) {
    const base = basenameOf(path);
    if (base === 'pubspec.yaml') for (const d of parsePubspec(content).dependencies) flutterDeps.add(d);
    else if (base === 'package.json') for (const d of parsePackageJson(content)) nodeDeps.add(d);
  }
  const packages = [
    ...collectPackages(flutterDeps, KEY_PACKAGES.flutter),
    ...collectPackages(nodeDeps, KEY_PACKAGES.node),
  ].slice(0, MAX_PACKAGES);

  return { frameworks: dedupedFrameworks.slice(0, MAX_FRAMEWORKS), languages, packages };
}
