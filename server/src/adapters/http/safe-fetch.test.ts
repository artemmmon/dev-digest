import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type https from 'node:https';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { SafeHttpFetcher, createGuardedLookup, assertPublicHttpsUrl } from './safe-fetch.js';

type Answer = { status: number; headers?: Record<string, string>; chunks?: string[] };

/** A fake `https.request`: answers per requested URL, never opens a socket. */
function fakeRequest(answers: Record<string, Answer>, seen: string[] = []): typeof https.request {
  return ((url: URL, _o: unknown, cb: (res: unknown) => void) => {
    seen.push(url.href);
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const a = answers[url.href];
      if (!a) return req.emit('error', Object.assign(new Error('nope'), { code: 'ENOTFOUND' }));
      const res = Object.assign(new EventEmitter(), {
        statusCode: a.status,
        headers: a.headers ?? {},
        resume() {},
        destroy() {},
      });
      cb(res);
      for (const c of a.chunks ?? []) res.emit('data', Buffer.from(c));
      res.emit('end');
    };
    return req;
  }) as never;
}

const O = { maxBytes: 16, timeoutMs: 1000 };
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('SafeHttpFetcher', () => {
  it('returns the body', async () => {
    const f = new SafeHttpFetcher({
      request: fakeRequest({ 'https://example.com/a.md': { status: 200, chunks: ['# ', 'Hi'] } }),
    });
    expect(text(await f.fetch(new URL('https://example.com/a.md'), O))).toBe('# Hi');
  });

  it('follows a redirect and re-validates it', async () => {
    const seen: string[] = [];
    const f = new SafeHttpFetcher({
      request: fakeRequest(
        {
          'https://example.com/a.md': { status: 302, headers: { location: '/b.md' } },
          'https://example.com/b.md': { status: 200, chunks: ['ok'] },
          'https://example.com/evil.md': { status: 302, headers: { location: 'http://example.com/x.md' } },
          'https://example.com/ip.md': { status: 301, headers: { location: 'https://169.254.169.254/x.md' } },
          'https://example.com/loop.md': { status: 302, headers: { location: 'loop.md' } },
        },
        seen,
      ),
    });
    expect(text(await f.fetch(new URL('https://example.com/a.md'), O))).toBe('ok');
    expect(seen).toEqual(['https://example.com/a.md', 'https://example.com/b.md']);
    await expect(f.fetch(new URL('https://example.com/evil.md'), O)).rejects.toThrow(/https/);
    await expect(f.fetch(new URL('https://example.com/ip.md'), O)).rejects.toThrow(/IP address/);
    await expect(f.fetch(new URL('https://example.com/loop.md'), O)).rejects.toThrow(/redirects more than 3/);
  });

  it('enforces the byte cap, declared and streamed', async () => {
    const f = new SafeHttpFetcher({
      request: fakeRequest({
        'https://example.com/big.md': { status: 200, headers: { 'content-length': '999' } },
        'https://example.com/stream.md': { status: 200, chunks: ['12345678', '12345678', '1'] },
      }),
    });
    await expect(f.fetch(new URL('https://example.com/big.md'), O)).rejects.toThrow(/too large/);
    await expect(f.fetch(new URL('https://example.com/stream.md'), O)).rejects.toThrow(/too large/);
  });

  it('maps statuses to 422 (client side) and 502 (server side)', async () => {
    const f = new SafeHttpFetcher({
      request: fakeRequest({
        'https://example.com/gone.md': { status: 404 },
        'https://example.com/down.md': { status: 503 },
      }),
    });
    await expect(f.fetch(new URL('https://example.com/gone.md'), O)).rejects.toBeInstanceOf(ValidationError);
    await expect(f.fetch(new URL('https://example.com/down.md'), O)).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(f.fetch(new URL('https://example.com/none.md'), O)).rejects.toThrow(/could not be resolved/);
  });

  it('refuses a non-https, credentialed or IP-literal start URL before connecting', () => {
    for (const u of ['http://a.com/x.md', 'https://u:p@a.com/x.md', 'https://a.com:81/x.md', 'https://10.0.0.1/x.md']) {
      expect(() => assertPublicHttpsUrl(new URL(u))).toThrow(ValidationError);
    }
  });
});

describe('createGuardedLookup', () => {
  const resolver =
    (...addrs: string[]) =>
    (_h: string, _o: unknown, cb: (e: null, a: Array<{ address: string; family: number }>) => void) =>
      cb(null, addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));

  const run = (lookup: ReturnType<typeof createGuardedLookup>, all: boolean) =>
    new Promise<{ err: Error | null; address: unknown }>((resolve) =>
      lookup('example.com', { all } as never, (err, address) => resolve({ err, address })),
    );

  it('passes public answers through, in both callback shapes', async () => {
    const lookup = createGuardedLookup(resolver('93.184.216.34') as never);
    expect(await run(lookup, false)).toEqual({ err: null, address: '93.184.216.34' });
    expect((await run(lookup, true)).address).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('rejects when the name resolves to a private address, even next to a public one (rebinding)', async () => {
    for (const set of [['127.0.0.1'], ['93.184.216.34', '10.0.0.5'], ['::ffff:127.0.0.1'], ['fd00::1']]) {
      const { err } = await run(createGuardedLookup(resolver(...set) as never), false);
      expect((err as { code?: string }).code).toBe('ERR_BLOCKED_ADDRESS');
    }
  });

  it('turns a blocked address into a 422 for the caller', async () => {
    const f = new SafeHttpFetcher({
      lookup: createGuardedLookup(resolver('169.254.169.254') as never),
      request: ((url: URL, o: { lookup: (...a: never[]) => void }) => {
        const req = new EventEmitter() as EventEmitter & { end: () => void };
        req.end = () => o.lookup('example.com' as never, {} as never, ((e: Error) => req.emit('error', e)) as never);
        void url;
        return req;
      }) as never,
    });
    await expect(f.fetch(new URL('https://example.com/x.md'), O)).rejects.toThrow(/private or internal/);
  });
});
