/**
 * Failure of a call to the DevDigest API. `kind` is all the tools need; the message
 * is fixed text per kind. Response bodies, stacks and request paths are never copied
 * into it (they can carry LLM output, SQL or filesystem paths).
 */
export type ApiErrorKind = 'unreachable' | 'not_found' | 'rate_limited' | 'invalid' | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status?: number,
  ) {
    super(`DevDigest API call failed (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'ApiError';
  }
}
