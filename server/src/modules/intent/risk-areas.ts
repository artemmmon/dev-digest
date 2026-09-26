import type { RiskArea } from '@devdigest/shared';
import { INTENT_LIMITS } from '@devdigest/shared';
import {
  DEPENDENCY_MANIFEST_PATTERN,
  DEPENDENCY_NAME_PATTERN,
  RULE_PATH_PATTERNS,
} from './constants.js';

/**
 * D13(b): pure, deterministic rule chips from changed paths and added manifest
 * lines. No diff bodies are inspected beyond `pr_files.patch`'s own `+` lines
 * (already fenced/local, never fetched). At most `maxRuleRiskAreas`.
 */

export interface FileChange {
  path: string;
  patch?: string | null;
}

// package.json: `+    "name": "^1.2.3"` — the value must look like a version spec, so a new
// top-level field (`"packageManager": "pnpm@10.0.0"`, `"homepage": "https://…"`) is not a dependency.
const DEPENDENCY_LINE =
  /^\+\s*"([^"\n]{1,60})"\s*:\s*"(?:[\^~>=<*]|\d|x\b|latest\b|next\b|workspace:|npm:|file:|link:|git(?:\+|:|hub:))/;
const REMOVED_DEPENDENCY_LINE = /^-\s*"([^"\n]{1,60})"\s*:\s*"/;
// pubspec.yaml: a top-level (2-space) entry with a version constraint, `+  crypto: ^3.0.3`.
// git/path/sdk deps (no inline version) are skipped; `sdk`/`flutter` are not packages.
const PUBSPEC_LINE = /^\+ {2}([a-z_][a-z0-9_]{0,59}):\s*["']?(?:[\^~>=<]|any\b|\d)/;
const REMOVED_PUBSPEC_LINE = /^- {2}([a-z_][a-z0-9_]{0,59}):/;
const PUBSPEC_NOT_PACKAGES = new Set(['sdk', 'flutter']);

function isPubspec(path: string): boolean {
  return /(^|\/)pubspec\.yaml$/.test(path);
}

/** Names newly added to `package.json` / `pubspec.yaml` (a `+` line with no matching `-`). */
function newDependencyNames(files: FileChange[]): string[] {
  const names: string[] = [];
  for (const f of files) {
    if (!DEPENDENCY_MANIFEST_PATTERN.test(f.path) || !f.patch) continue;
    const removed = new Set<string>();
    const added: string[] = [];
    const pubspec = isPubspec(f.path);
    const addedRe = pubspec ? PUBSPEC_LINE : DEPENDENCY_LINE;
    const removedRe = pubspec ? REMOVED_PUBSPEC_LINE : REMOVED_DEPENDENCY_LINE;
    for (const line of f.patch.split('\n')) {
      const removedMatch = line.match(removedRe);
      if (removedMatch?.[1]) removed.add(removedMatch[1]);
      const addedMatch = line.match(addedRe);
      const name = addedMatch?.[1];
      if (name && DEPENDENCY_NAME_PATTERN.test(name) && !(pubspec && PUBSPEC_NOT_PACKAGES.has(name))) {
        added.push(name);
      }
    }
    for (const name of added) {
      if (!removed.has(name) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Derive the server rule chips (D13b) from the PR's changed files. */
export function deriveRuleRiskAreas(files: FileChange[]): RiskArea[] {
  const areas: RiskArea[] = [];
  const push = (kind: RiskArea['kind'], label: string) => {
    if (areas.length >= INTENT_LIMITS.maxRuleRiskAreas) return;
    areas.push({ kind, label: label.slice(0, INTENT_LIMITS.riskAreaLabelChars), origin: 'rule' });
  };

  for (const rule of RULE_PATH_PATTERNS) {
    if (files.some((f) => rule.pattern.test(f.path))) push(rule.kind, rule.label);
  }
  for (const name of newDependencyNames(files)) {
    push('dependency', `new dependency ${name}`);
  }

  return areas.slice(0, INTENT_LIMITS.maxRuleRiskAreas);
}

/**
 * Merge rule + model risk areas (D13, user decision 2026-09-24): rule chips
 * FIRST, deduped by `kind` + normalised label, at most `maxRiskAreas` total.
 */
export function mergeRiskAreas(rule: RiskArea[], model: RiskArea[]): RiskArea[] {
  const seen = new Set<string>();
  const merged: RiskArea[] = [];
  for (const area of [...rule, ...model]) {
    const key = `${area.kind}:${area.label.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(area);
    if (merged.length >= INTENT_LIMITS.maxRiskAreas) break;
  }
  return merged;
}
