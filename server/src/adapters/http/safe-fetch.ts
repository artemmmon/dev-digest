import dns from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';
import { isBlockedAddress } from './ip-guard.js';

/**
 * Outbound HTTPS GET of a user-supplied URL (skill import). The URL is untrusted, so:
 *  - https only, no credentials, default port, no IP literals (`assertPublicHttpsUrl`);
 *  - the address is checked when the socket connects (custom `lookup`), so a host name
 *    that resolves to a private IP, or is re-pointed between check and use (DNS
 *    rebinding), is refused;
 *  - at most MAX_REDIRECTS redirects, each hop validated again;
 *  - the body is read as a stream and dropped past `maxBytes`; one timer covers the whole call.
 * Structurally satisfies the skills module's `RemoteFileFetcher` port (adapters never
 * import feature modules).
 */

export const MAX_REDIRECTS = 3;

export class BlockedAddressError extends Error {
  readonly code = 'ERR_BLOCKED_ADDRESS';
  constructor(host: string) {
    super(`Refusing to connect to a private or internal address (${host})`);
  }
}

type Resolve = (
  host: string,
  options: dns.LookupAllOptions,
  cb: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

/** A `lookup` for `net.connect` that resolves, then refuses when ANY answer is blocked. */
export function createGuardedLookup(resolve: Resolve = dns.lookup as Resolve) {
  return (
    host: string,
    options: dns.LookupOptions,
    cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
  ) => {
    resolve(host, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err, '');
      if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
        return cb(new BlockedAddressError(host), '');
      }
      if (options.all) return cb(null, addresses);
      return cb(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

/** Same rules as the skills URL normaliser, restated here because adapters may not import modules. */
export function assertPublicHttpsUrl(url: URL): void {
  if (url.protocol !== 'https:') throw new ValidationError('Only https:// URLs can be imported');
  if (url.username || url.password) throw new ValidationError('A URL with credentials is not allowed');
  if (url.port && url.port !== '443') throw new ValidationError('Only the default https port is allowed');
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new ValidationError('Use a host name, not an IP address');
}

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
}

type Hop = { kind: 'body'; bytes: Uint8Array } | { kind: 'redirect'; location: string };

export interface SafeHttpFetcherDeps {
  /** Replaceable for tests. */
  lookup?: ReturnType<typeof createGuardedLookup>;
  request?: typeof https.request;
}

export class SafeHttpFetcher {
  private lookup: ReturnType<typeof createGuardedLookup>;
  private request: typeof https.request;

  constructor(deps: SafeHttpFetcherDeps = {}) {
    this.lookup = deps.lookup ?? createGuardedLookup();
    this.request = deps.request ?? https.request;
  }

  async fetch(url: URL, opts: SafeFetchOptions): Promise<Uint8Array> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    try {
      let current = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        assertPublicHttpsUrl(current);
        const res = await this.once(current, opts.maxBytes, ac.signal);
        if (res.kind === 'body') return res.bytes;
        try {
          current = new URL(res.location, current);
        } catch {
          throw new ExternalServiceError('The server sent an invalid redirect');
        }
      }
      throw new ValidationError(`The URL redirects more than ${MAX_REDIRECTS} times`);
    } finally {
      clearTimeout(timer);
    }
  }

  private once(url: URL, maxBytes: number, signal: AbortSignal): Promise<Hop> {
    return new Promise<Hop>((resolve, reject) => {
      const fail = (err: unknown) => reject(mapError(err, signal));
      const req = this.request(
        url,
        {
          method: 'GET',
          agent: false,
          lookup: this.lookup as never,
          signal,
          headers: {
            accept: 'text/markdown, text/plain, application/zip, */*;q=0.1',
            'accept-encoding': 'identity',
            'user-agent': 'devdigest-skill-import',
          },
        },
        (res: IncomingMessage) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            return resolve({ kind: 'redirect', location: res.headers.location });
          }
          if (status < 200 || status >= 300) {
            res.resume();
            return fail(
              status >= 500
                ? new ExternalServiceError(`The server answered ${status}`)
                : new ValidationError(`The server answered ${status} for this URL`),
            );
          }
          const declared = Number(res.headers['content-length']);
          if (Number.isFinite(declared) && declared > maxBytes) {
            res.destroy();
            return fail(new ValidationError('The file is too large'));
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > maxBytes) {
              res.destroy();
              return fail(new ValidationError('The file is too large'));
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ kind: 'body', bytes: new Uint8Array(Buffer.concat(chunks)) }));
          res.on('error', fail);
        },
      );
      req.on('error', fail);
      req.end();
    });
  }
}

function mapError(err: unknown, signal: AbortSignal): Error {
  if (err instanceof ValidationError || err instanceof ExternalServiceError) return err;
  const e = err as NodeJS.ErrnoException;
  if (e instanceof BlockedAddressError || e?.code === 'ERR_BLOCKED_ADDRESS') {
    return new ValidationError('The URL points to a private or internal address');
  }
  if (signal.aborted || e?.name === 'AbortError') return new ExternalServiceError('The URL took too long to answer');
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN') {
    return new ValidationError('The host name of the URL could not be resolved');
  }
  return new ExternalServiceError(`Could not fetch the URL (${e?.code ?? e?.message ?? 'network error'})`);
}
