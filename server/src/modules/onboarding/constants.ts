import type { Provider } from '@devdigest/shared';

/** Tunables and fixed texts of the onboarding tour. Nothing here touches I/O. */

/** A generation that has not finished in this time ends as failed (SPEC-11 OQ-1). */
export const GENERATION_TIMEOUT_MS = 180_000;

/** Token budget of the user prompt; what does not fit is clipped or left out. */
export const PROMPT_TOKEN_BUDGET = 30_000;
/** Token budget asked from repo-intel for the repo map. */
export const REPO_MAP_TOKEN_BUDGET = 4_000;
/** The block of a section is dropped when less than this many tokens are left for it. */
export const MIN_BLOCK_TOKENS = 200;

export const LLM_TEMPERATURE = 0.2;
export const LLM_MAX_TOKENS = 6_000;

/** A file larger than this is skipped, not truncated (generated bundles, data dumps). */
export const MAX_FILE_CHARS = 200_000;
/** Per-file share of the prompt; a longer file is cut at a line boundary. */
export const MAX_RUN_FILE_PROMPT_CHARS = 6_000;
export const MAX_EXCERPT_PROMPT_CHARS = 4_000;

/** Ranked files requested from repo-intel, and how many of them get an excerpt. */
export const TOP_FILE_COUNT = 24;
export const EXCERPT_FILE_COUNT = 10;
/** Longest dependency chains shown, and files per chain. */
export const MAX_CHAINS = 5;
export const MAX_CHAIN_LENGTH = 8;
/** Run files (README, manifests, compose, example env) read per generation. */
export const MAX_RUN_FILES = 14;
/** Deepest directory (counted in slashes) in which a run file is looked for. */
export const RUN_FILE_MAX_DEPTH = 2;
/** Tracked source files offered when the index has no ranked files. */
export const FALLBACK_SOURCE_COUNT = 20;
/** Lines of the tracked-file summary. */
export const TREE_SUMMARY_LINES = 40;

/** Run-file categories in priority order: README first, then manifests, compose files, example env files. */
export const README_PATTERN = /^readme(\.[\w-]+)?$/i;
export const MANIFEST_PATTERN =
  /^(package\.json|pyproject\.toml|setup\.py|setup\.cfg|requirements(-[\w]+)?\.txt|pipfile|pubspec\.yaml|cargo\.toml|go\.mod|makefile|gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|dockerfile)$/i;
export const COMPOSE_PATTERN = /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/i;

/** An environment file is readable only when its name ends with one of these. */
export const EXAMPLE_ENV_SUFFIXES: readonly string[] = ['.example', '.sample', '.template'];

/** Keys, certificates and credentials are never read into a prompt. */
export const SECRET_FILE_PATTERN =
  /\.(pem|key|p12|pfx|keystore|jks|crt|cer)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)|(^|\/)\.npmrc$|(^|\/)(secrets?|credentials?)(\.|\/|$)|google-services\.json$|GoogleService-Info\.plist$/i;

/** Extensions worth offering as source when the index ranked nothing. */
export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte',
  'dart', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'rb', 'php', 'cs', 'scala',
  'c', 'cc', 'cpp', 'h', 'hpp', 'ex', 'exs',
]);

/** Failure texts: the only strings that ever reach `store.fail` (never `err.message`). */
export const TIMEOUT_MESSAGE = 'Generation timed out';
export const RESTART_MESSAGE = 'Generation was interrupted by a server restart. Try again.';
export const MODEL_FAILURE_MESSAGE =
  'The model could not produce a valid tour. Try again.';
/** `{provider}` is replaced with the provider's display name. */
export const MISSING_KEY_MESSAGE_TEMPLATE =
  'No API key is stored for {provider}. Add it in Settings and try again.';

export const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

/** Fixed `schemaName` of the structured request. */
export const TOUR_SCHEMA_NAME = 'OnboardingTourDraft';
