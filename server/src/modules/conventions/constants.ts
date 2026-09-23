import { ConventionCategory } from '@devdigest/shared';

/**
 * `GENERATED_FILE_PATTERN` / `JUNK_DIR_PATTERN` / `LOCKFILE_PATTERN` / `SCAFFOLD_DIR_PATTERN`
 * live in `@devdigest/shared` (`contracts/languages.ts`) — the repo-stack detector
 * (`modules/repos/stack.ts`) needs the same file-classification rules, and a constant used
 * by more than one module belongs in the core, not in a feature module (onion-architecture).
 * Re-exported here so existing imports of this file don't change.
 */
export {
  GENERATED_FILE_PATTERN,
  JUNK_DIR_PATTERN,
  LOCKFILE_PATTERN,
  SCAFFOLD_DIR_PATTERN,
} from '@devdigest/shared';

/** Tunables of the conventions extractor. Nothing here touches I/O. */

/** Repo-intel + fallback source samples per scan. */
export const SOURCE_SAMPLE_COUNT = 12;
/** Test files added on top, so the model can see how the repo tests. */
export const TEST_SAMPLE_COUNT = 2;
/** Config files shown to the model (depth <= CONFIG_MAX_DEPTH). */
export const MAX_CONFIG_FILES = 8;
export const CONFIG_MAX_DEPTH = 2;

/** A file larger than this is skipped, not truncated (generated bundles, data dumps). */
export const MAX_FILE_CHARS = 200_000;
/** Per-file share of the prompt; longer files are cut at a line boundary (verification still sees the whole file). */
export const MAX_SAMPLE_PROMPT_CHARS = 9_000;
export const MAX_CONFIG_PROMPT_CHARS = 3_500;
/** Total user-prompt budget (~20k tokens). Samples that do not fit are dropped, lowest priority last. */
export const PROMPT_CHAR_BUDGET = 80_000;

/** Ask for a bit more than we keep, so dedup and the evidence gate have room. */
export const REQUESTED_CONVENTIONS = 20;
export const MAX_PER_CATEGORY = 4;
export const MAX_TOTAL = 20;

/** Jaccard similarity of word sets at or above which two rules count as the same. */
export const DUPLICATE_SIMILARITY = 0.8;

/** A snippet with fewer non-space characters is too generic to prove anything. */
export const MIN_SNIPPET_CHARS = 8;
/** Longest evidence slice stored per candidate, in lines. */
export const MAX_EVIDENCE_LINES = 12;
/** Longest snippet shown per rule in a generated skill body. */
export const MAX_SKILL_SNIPPET_LINES = 6;
export const MAX_RULE_CHARS = 500;
export const MAX_SKILL_DESCRIPTION_CHARS = 500;

export const LLM_TEMPERATURE = 0.2;
export const LLM_MAX_TOKENS = 4000;
export const LLM_MAX_RETRIES = 1;
export const LLM_TIMEOUT_MS = 120_000;

export const SYSTEM_PROMPT_FILE = 'conventions.system.md';
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/** Fixed section order of a generated skill body. */
export const CATEGORY_ORDER: readonly ConventionCategory[] = ConventionCategory.options;

/** Source extensions worth sampling (repo-intel indexes JS/TS only; this covers the rest). */
export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte',
  'dart', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'rb', 'php', 'cs', 'scala',
  'c', 'cc', 'cpp', 'h', 'hpp', 'ex', 'exs',
]);

/** Tracked config files worth showing. Order = priority when the cap bites. */
export const CONFIG_FILE_PATTERNS: readonly RegExp[] = [
  /^package\.json$/,
  /^tsconfig(\.[\w-]+)?\.json$/,
  /^eslint\.config\.\w+$/,
  /^\.eslintrc(\.[\w]+)?$/,
  /^\.prettierrc(\.[\w]+)?$/,
  /^prettier\.config\.\w+$/,
  /^\.editorconfig$/,
  /^biome\.jsonc?$/,
  /^pyproject\.toml$/,
  /^\.?ruff\.toml$/,
  /^go\.mod$/,
  /^Cargo\.toml$/,
  /^\.?rustfmt\.toml$/,
  /^pubspec\.yaml$/,
  /^analysis_options\.yaml$/,
  /^\.rubocop\.yml$/,
];

/** Secrets and credentials are never read into a prompt. */
export const SECRET_FILE_PATTERN =
  /(^|\/)\.env(\.|$)|(^|\/)\.npmrc$|\.(pem|key|p12|pfx|keystore|jks|crt|cer)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)|(^|\/)(secrets?|credentials?)(\.|\/|$)|google-services\.json$|GoogleService-Info\.plist$/i;

export const TEST_PATH_PATTERN =
  /(^|\/)(tests?|__tests__|spec|specs|e2e|integration_test|testdata|fixtures?)\/|\.(test|spec)\.\w+$|_test\.(go|dart|py|rb|exs?)$|(^|\/)test_[^/]*\.py$|Tests?\.(java|kt|swift|cs)$/i;
