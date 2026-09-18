/**
 * Constants shared by the code-index adapters (ast-grep, ripgrep, tokenizer) and
 * the repo-intel module that drives them. They live in the core so an adapter
 * never has to import a feature module (onion-architecture: arrows point inward).
 */

/** Source files the indexer parses. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;

/** Directories the indexer never walks. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

/** A repo indexes at most this many files (the first N by path when it has more). */
export const MAX_INDEXED_FILES = 5000;

/** Files larger than this are skipped (counted in the walk stats). */
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
