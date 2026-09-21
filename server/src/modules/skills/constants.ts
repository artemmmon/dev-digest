/** Limits and file rules for skill import. */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 200;
/** The chosen markdown file, uncompressed. */
export const MAX_SKILL_FILE_BYTES = 1024 * 1024;
/** Everything in the archive, uncompressed, as declared by the headers. */
export const MAX_ARCHIVE_TOTAL_BYTES = 10 * 1024 * 1024;

/** Files that would run if someone executed them; listed in the preview, never read. */
export const EXECUTABLE_EXT = new Set([
  '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.pl', '.ps1',
  '.bat', '.cmd', '.exe', '.dll', '.so', '.dylib', '.jar', '.php',
]);
export const EXECUTABLE_DIRS = new Set(['scripts', 'bin']);

export const MAX_DESCRIPTION_CHARS = 300;
export const DEFAULT_SKILL_TYPE = 'custom' as const;
