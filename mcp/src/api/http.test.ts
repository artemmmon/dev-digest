import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiErrorKind } from './errors.js';
import { HttpDevDigestApi } from './http.js';

const RID = '11111111-1111-4111-8111-111111111111';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function api(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchImpl = vi.fn(impl);
  return { api: new HttpDevDigestApi({ apiUrl: 'http://localhost:3001' }, fetchImpl), fetchImpl };
}

async function kindOf(p: Promise<unknown>): Promise<ApiErrorKind | 'no error'> {
  try {
    await p;
    return 'no error';
  } catch (err) {
    if (err instanceof ApiError) return err.kind;
    throw err;
  }
}

describe('HttpDevDigestApi', () => {
  it('parses a 200 and keeps only the fields the tools read', async () => {
    const { api: a, fetchImpl } = api(async () =>
      json([{ id: RID, full_name: 'acme/api', owner: 'acme', extra: 1 }]),
    );
    const repos = await a.listRepos();
    expect(repos).toEqual([{ id: RID, full_name: 'acme/api' }]);
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://localhost:3001/repos');
  });

  it('pullByNumber returns null on 404 and the PR otherwise', async () => {
    const miss = api(async () => json({ error: { code: 'not_found', message: 'x' } }, 404));
    expect(await miss.api.pullByNumber(RID, 7)).toBeNull();
    expect(miss.fetchImpl.mock.calls[0]![0]).toBe(
      `http://localhost:3001/repos/${RID}/pulls/by-number/7`,
    );

    const hit = api(async () => json({ id: 'pr-1', number: 7, title: 'Add x' }));
    expect(await hit.api.pullByNumber(RID, 7)).toEqual({ id: 'pr-1', number: 7, title: 'Add x' });
  });

  it('a listed PR without an id is a server error', async () => {
    const { api: a } = api(async () => json([{ number: 7, title: 'Add x' }]));
    expect(await kindOf(a.syncPulls(RID))).toBe('server');
  });

  it('startReview posts the agent id and returns the run id', async () => {
    const { api: a, fetchImpl } = api(async () =>
      json({ pr_id: 'p', runs: [{ run_id: 'run-1', agent_id: 'a', agent_name: 'N' }], reviews: [] }),
    );
    expect(await a.startReview('pr-1', 'agent-1')).toEqual({ runId: 'run-1' });
    const init = fetchImpl.mock.calls[0]![1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ agentId: 'agent-1' });
  });

  it.each<[number, ApiErrorKind]>([
    [404, 'not_found'],
    [422, 'invalid'],
    [400, 'invalid'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
  ])('maps status %i to %s', async (status, kind) => {
    const { api: a } = api(async () => json({ error: { code: 'x', message: 'secret body' } }, status));
    expect(await kindOf(a.listAgents())).toBe(kind);
  });

  it('never copies the response body or the path into the error message', async () => {
    const { api: a } = api(async () =>
      json({ error: { code: 'internal_error', message: 'select * from secrets' } }, 500),
    );
    const err = await a.reviews('pr-secret-path').catch((e: unknown) => e);
    expect((err as Error).message).not.toContain('select');
    expect((err as Error).message).not.toContain('pr-secret-path');
  });

  it('a refused connection is unreachable', async () => {
    const { api: a } = api(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    expect(await kindOf(a.listRepos())).toBe('unreachable');
  });

  it('our own timeout is unreachable', async () => {
    const { api: a } = api(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    expect(await kindOf(a.listRepos())).toBe('unreachable');
  });

  it('a caller abort propagates as the original error, not an ApiError', async () => {
    const ctrl = new AbortController();
    const { api: a } = api(async (_url, init) => {
      ctrl.abort();
      throw init.signal!.reason;
    });
    const err = await a.listRepos(ctrl.signal).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('malformed JSON and schema mismatches are server errors', async () => {
    const bad = api(async () => new Response('<html>', { status: 200 }));
    expect(await kindOf(bad.api.listRepos())).toBe('server');
    const wrong = api(async () => json([{ id: 1 }]));
    expect(await kindOf(wrong.api.listRepos())).toBe('server');
  });

  it('refreshPull ignores the body of a 200', async () => {
    const { api: a } = api(async () => json({ huge: 'detail' }));
    await expect(a.refreshPull('pr-1')).resolves.toBeUndefined();
  });
});
