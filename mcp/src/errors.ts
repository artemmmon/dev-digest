import type { ApiError } from './api/errors.js';

/**
 * A failure whose message is already written for the caller: what happened and what to
 * do next. Thrown by the application layer; the MCP edge (`tools/context.ts`) is the
 * only place that turns it into an `isError` result.
 */
export class NextStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NextStepError';
  }
}

/** The one place an `ApiError` becomes text. Fixed strings only: no body, path or stack. */
export function apiErrorMessage(err: ApiError, apiUrl: string): string {
  switch (err.kind) {
    case 'unreachable':
      return `DevDigest API is not reachable at ${apiUrl}. Start it with ./scripts/dev.sh, then retry.`;
    case 'rate_limited':
      return 'DevDigest rate-limited the request; wait about a minute and retry.';
    case 'not_found':
      return 'DevDigest could not find that item. Check the repo, PR and agent arguments (list_agents shows valid agents), then retry.';
    case 'invalid':
      return 'DevDigest rejected the request as invalid. Check the arguments against the tool description, then retry.';
    case 'server':
      return 'DevDigest API failed while handling the request. Check the API log (./scripts/dev.sh output), then retry.';
  }
}
