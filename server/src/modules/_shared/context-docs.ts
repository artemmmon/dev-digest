import { ValidationError } from '../../platform/errors.js';

/**
 * The one rule for saving an attachment list: no duplicates, and every path that is not already
 * stored for this owner and repo must be a document of the repository. A stored path that is no
 * longer a document is kept (it shows as missing at run time).
 */
export function assertAttachablePaths(paths: string[], stored: string[], available: string[]): void {
  if (new Set(paths).size !== paths.length) {
    throw new ValidationError('A document can be attached only once');
  }
  const known = new Set([...stored, ...available]);
  const unknown = paths.filter((p) => !known.has(p));
  if (unknown.length > 0) {
    throw new ValidationError('Not a document of this repository', { paths: unknown });
  }
}
