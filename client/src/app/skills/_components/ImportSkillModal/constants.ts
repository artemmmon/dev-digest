/** What the file picker offers and the server accepts. */
export const ACCEPT = ".md,.zip";
export const ALLOWED_EXT = [".md", ".zip"] as const;
/** Mirrors the server's MAX_IMPORT_BYTES. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** The two ways to bring a skill in; the tab keys double as i18n keys (`import.tabs.<key>`). */
export const IMPORT_TABS = ["file", "url"] as const;
export type ImportTab = (typeof IMPORT_TABS)[number];
