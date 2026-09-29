import type { z } from 'zod';
import type { McpConfig } from '../config.js';
import { ApiError } from './errors.js';
import type { DevDigestApi, PullRef } from './port.js';
import {
  ActiveRunListLite,
  AgentListLite,
  ConventionListResponseLite,
  PrListLite,
  PrLite,
  RepoListLite,
  ReviewListLite,
  RunListLite,
  StartedReviewLite,
} from './schemas.js';

export const REQUEST_TIMEOUT_MS = 20_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function seg(id: string): string {
  return encodeURIComponent(id);
}

function withId(pr: z.output<typeof PrLite>): PullRef {
  if (!pr.id) throw new ApiError('server');
  return { ...pr, id: pr.id };
}

/** REST adapter over the running DevDigest API (`DEVDIGEST_API_URL`, loopback only). */
export class HttpDevDigestApi implements DevDigestApi {
  private readonly base: string;

  constructor(
    config: Pick<McpConfig, 'apiUrl'>,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.base = config.apiUrl;
  }

  /** One request → parsed body. `null` means a 404 when `allowNotFound` is set. */
  private async request<S extends z.ZodTypeAny>(
    method: 'GET' | 'POST',
    path: string,
    schema: S | null,
    opts: { signal?: AbortSignal | undefined; body?: unknown; allowNotFound?: boolean } = {},
  ): Promise<z.output<S> | null> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        signal,
        headers: {
          accept: 'application/json',
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      // The caller gave up (client cancelled): not an API failure, let it propagate.
      if (opts.signal?.aborted) throw err;
      // Refused, reset, DNS or our own timeout: the API is not usable right now.
      throw new ApiError('unreachable');
    }

    if (res.status === 404 && opts.allowNotFound) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) throw new ApiError('not_found', 404);
      if (res.status === 429) throw new ApiError('rate_limited', 429);
      if (res.status === 400 || res.status === 422) throw new ApiError('invalid', res.status);
      throw new ApiError('server', res.status);
    }
    if (schema === null) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError('server', res.status);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError('server', res.status);
    return parsed.data;
  }

  private async get<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    return (await this.request('GET', path, schema, { signal })) as z.output<S>;
  }

  listRepos(signal?: AbortSignal) {
    return this.get('/repos', RepoListLite, signal);
  }

  listAgents(signal?: AbortSignal) {
    return this.get('/agents', AgentListLite, signal);
  }

  async pullByNumber(repoId: string, number: number, signal?: AbortSignal) {
    const pr = await this.request(
      'GET',
      `/repos/${seg(repoId)}/pulls/by-number/${seg(String(number))}`,
      PrLite,
      { signal, allowNotFound: true },
    );
    return pr ? withId(pr) : null;
  }

  async syncPulls(repoId: string, signal?: AbortSignal) {
    return (await this.get(`/repos/${seg(repoId)}/pulls`, PrListLite, signal)).map(withId);
  }

  async refreshPull(prId: string, signal?: AbortSignal) {
    await this.request('GET', `/pulls/${seg(prId)}`, null, { signal });
  }

  activeRuns(prId: string, signal?: AbortSignal) {
    return this.get(`/pulls/${seg(prId)}/runs/active`, ActiveRunListLite, signal);
  }

  async startReview(prId: string, agentId: string, signal?: AbortSignal) {
    const started = (await this.request('POST', `/pulls/${seg(prId)}/review`, StartedReviewLite, {
      signal,
      body: { agentId },
    })) as z.output<typeof StartedReviewLite>;
    const run = started.runs[0];
    if (!run) throw new ApiError('server');
    return { runId: run.run_id };
  }

  listRuns(prId: string, signal?: AbortSignal) {
    return this.get(`/pulls/${seg(prId)}/runs`, RunListLite, signal);
  }

  reviews(prId: string, signal?: AbortSignal) {
    return this.get(`/pulls/${seg(prId)}/reviews`, ReviewListLite, signal);
  }

  conventions(repoId: string, signal?: AbortSignal) {
    return this.get(`/repos/${seg(repoId)}/conventions`, ConventionListResponseLite, signal);
  }
}
