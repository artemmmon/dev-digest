/**
 * F1 — pure manifest readers for the repo-stack detector (`stack.ts`). Each takes the
 * manifest's TEXT (already read by the caller through `GitClient.readFile`) and returns
 * plain facts — no I/O, no YAML/TOML library: these formats are simple enough that a
 * small line reader is more honest than a partial third-party parser.
 */

/** One dependency-manifest fact: whether it marks a Flutter package, and its dependency names. */
export interface PubspecInfo {
  isFlutter: boolean;
  dependencies: string[];
}

/**
 * `pubspec.yaml` — a line-indentation reader, not a YAML parser: a top-level (0-indent)
 * `key:` opens a section, a 2-space-indented `key:` inside `dependencies`/`dev_dependencies`
 * is a package name. `dependency_overrides` is deliberately not read (it's a pin, not a
 * feature the repo uses). `isFlutter` is the presence of `sdk: flutter` anywhere — that
 * line is how pub marks "this package depends on the Flutter SDK itself", set by every
 * Flutter app/plugin and no plain Dart package.
 */
export function parsePubspec(content: string): PubspecInfo {
  const dependencies = new Set<string>();
  let section: string | null = null;

  for (const raw of content.split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;

    const top = raw.match(/^([A-Za-z_][\w-]*):/);
    if (top) {
      section = top[1]!;
      continue;
    }
    if (section !== 'dependencies' && section !== 'dev_dependencies') continue;

    const child = raw.match(/^ {2}([A-Za-z_][\w.-]*):/);
    if (child) dependencies.add(child[1]!);
  }

  return { isFlutter: /sdk:\s*flutter\b/.test(content), dependencies: [...dependencies] };
}

/** `package.json` — real JSON; dependency names only (versions don't matter for detection). */
export function parsePackageJson(content: string): string[] {
  try {
    const json = JSON.parse(content) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return [...Object.keys(json.dependencies ?? {}), ...Object.keys(json.devDependencies ?? {})];
  } catch {
    return []; // malformed manifest — detection degrades, never throws
  }
}

/** Python web framework guessed from `pyproject.toml` / `requirements.txt` content. */
export function pythonFramework(content: string): 'Django' | 'FastAPI' | 'Flask' | 'Python' {
  const text = content.toLowerCase();
  if (/\bdjango\b/.test(text)) return 'Django';
  if (/\bfastapi\b/.test(text)) return 'FastAPI';
  if (/\bflask\b/.test(text)) return 'Flask';
  return 'Python';
}
