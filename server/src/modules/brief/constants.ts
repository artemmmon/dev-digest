/**
 * Tunables of the brief module. Nothing here touches I/O (onion core — safe for
 * `budget.ts`, `domain.ts` and `prompt.ts` to import).
 */

export const SYSTEM_PROMPT_FILE = 'brief.system.md';

/** Whole-request and per-input limits (spec AC-16, AC-23, AC-26, AC-29, AC-35, NFR-2). */
export const BRIEF_BUDGET = {
  /** System text plus every input, as counted by the server's tokenizer. */
  requestTokens: 8_000,
  /** The attached documents' share of that. */
  documentTokens: 3_000,
  descriptionChars: 6_000,
  issueChars: 3_000,
  /** File rows kept after the "files outside the top N" step. */
  topFiles: 50,
} as const;

/** What a stored answer may hold (spec AC-48 – AC-51). Defined in `domain.ts` (core imports no other file). */
export { BRIEF_ANSWER_LIMITS } from './domain.js';

/**
 * Caps on inputs the budget cannot remove (or removes only as a last resort):
 * they make the "always at most 8,000" guarantee reachable.
 */
export const BRIEF_INPUT_CAPS = {
  titleChars: 300,
  blastSummaryChars: 400,
  maxChangedSymbols: 30,
  maxEndpoints: 20,
  maxCrons: 20,
  /** Every path, symbol name, endpoint and cron name. */
  nameChars: 200,
  /** The trusted system text. */
  systemTokens: 1_500,
  intentSummaryChars: 400,
  maxIntentItems: 10,
  intentItemChars: 200,
  maxIntentLabels: 10,
  intentLabelChars: 80,
} as const;

/** The model call. One request, plus the provider's one schema re-ask (user decision D5). */
export const LLM_TEMPERATURE = 0;
/** Output budget incl. reasoning tokens (deepseek-v4-flash reasons before it answers). */
export const LLM_MAX_TOKENS = 4_000;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_RETRIES = 1;
export const LLM_TRANSPORT_RETRIES = 0;
