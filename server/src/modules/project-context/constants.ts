/** The one discovery pattern (SPEC-10 AC-2); `helpers.isProjectDocument` is its local matcher. */
export const DOCUMENT_PATTERN = '**/{specs,docs,insights}/**/*.md';

/** Directory names that make a markdown file a project document, and its type. */
export const DOCUMENT_DIRS = ['specs', 'docs', 'insights'] as const;

/** One cap for every read: list token counts, previews and review runs (AC-58). */
export const MAX_DOCUMENT_BYTES = 65_536;

/** How many documents the list reads at the same time. */
export const LIST_READ_CONCURRENCY = 16;
