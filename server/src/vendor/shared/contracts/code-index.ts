/**
 * Constants shared by the code-index adapters (ast-grep, ripgrep, tokenizer) and
 * the repo-intel module that drives them. They live in the core so an adapter
 * never has to import a feature module (onion-architecture: arrows point inward).
 */

/** Source files the indexer parses. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
