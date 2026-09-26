import type { RiskAreaKind } from '@devdigest/shared';

/**
 * Tunables and glob tables for the intent layer. Nothing here touches I/O
 * (onion core — safe for `links.ts`/`hunks.ts`/`risk-areas.ts` to import).
 */

export const SYSTEM_PROMPT_FILE = 'intent.system.md';

export const LLM_TEMPERATURE = 0;
/**
 * Output budget incl. REASONING tokens: deepseek-v4-flash reasons before it answers,
 * and at 600 it spent the whole budget thinking (finish_reason `length`, empty content).
 */
export const LLM_MAX_TOKENS = 4000;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_RETRIES = 1;

/** Extensions accepted for a linked/added doc (D4) — anything else is not a doc link. */
export const DOC_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'mdx', 'txt', 'rst']);

/** A PR-added file under either of these prefixes counts as an available doc (D5). */
export const PR_ADDED_DOC_PREFIXES: readonly string[] = ['specs/', 'docs/plans/'];

/** Body length (non-heading chars) at/above which `basis` starts at `documented` (D3). */
export const SUBSTANTIVE_BODY_CHARS = 80;

interface RulePathPattern {
  kind: Extract<RiskAreaKind, 'auth' | 'migration' | 'ci_config' | 'secrets_config'>;
  label: string;
  pattern: RegExp;
}

/**
 * Server rule chips (D13b) keyed off the changed path alone — bounded, anchored
 * regexes (no ReDoS): each is a handful of alternatives with no nested
 * quantifiers.
 */
export const RULE_PATH_PATTERNS: readonly RulePathPattern[] = [
  {
    kind: 'auth',
    label: 'Touches auth surface',
    pattern: /(^|\/)(auth|authn|authz|session|jwt|oauth|permissions?|rbac|acl)([./_-]|\/|$)/i,
  },
  {
    kind: 'migration',
    label: 'Adds or changes a DB migration',
    pattern: /(^|\/)(migrations?)\//i,
  },
  {
    kind: 'ci_config',
    label: 'Changes CI/deploy config',
    pattern:
      /(^|\/)(\.github\/workflows\/|\.gitlab-ci\.ya?ml|\.circleci\/|\.travis\.ya?ml|Jenkinsfile|Dockerfile|docker-compose\.ya?ml)/i,
  },
  {
    kind: 'secrets_config',
    label: 'Changes env/secrets config',
    pattern: /(^|\/)(\.env(\.[\w-]+)?|secrets?\.(ya?ml|json))$/i,
  },
];

/** Manifest files scanned for newly-added dependency lines (D13b): npm and Dart/Flutter. */
export const DEPENDENCY_MANIFEST_PATTERN = /(^|\/)(package\.json|pubspec\.yaml)$/;

/** A dependency name, bounded so a crafted manifest line can't blow up a chip label. */
export const DEPENDENCY_NAME_PATTERN = /^[@\w./-]{1,60}$/;
