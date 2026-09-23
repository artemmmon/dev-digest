import { ValidationError } from '../../platform/errors.js';

/**
 * Pure URL rules for "import a skill from a URL". Nothing here touches the network: the
 * result is what the fetcher is allowed to request. The fetcher re-checks the address at
 * connect time, because a hostname can resolve to a private IP.
 */

const ALLOWED_EXT = new Set(['.md', '.zip']);
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
/** WHATWG URL already normalises `2130706433` and `0x7f.1` to dotted form; IPv6 keeps its brackets. */
const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\])$/;
const RAW_HOST = 'raw.githubusercontent.com';

export interface SkillUrl {
  /** What to request (a GitHub `blob` link already rewritten to its raw form). */
  url: URL;
  /** Last path segment, decoded; decides how the bytes are parsed. */
  filename: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizeSkillUrl(input: string): SkillUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ValidationError('Enter a valid URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https:// URLs can be imported');
  if (url.username || url.password) {
    throw new ValidationError('A URL with a user name or password is not allowed');
  }
  if (url.port && url.port !== '443') throw new ValidationError('Only the default https port is allowed');
  if (IP_LITERAL.test(url.hostname)) {
    throw new ValidationError('Use a host name, not an IP address');
  }
  url.hash = '';

  // github.com/<owner>/<repo>/blob|raw/<ref>/<path>  ->  raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
  if (GITHUB_HOSTS.has(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean);
    const [owner, repo, kind, ref, ...path] = parts;
    if (owner && repo && (kind === 'blob' || kind === 'raw') && ref && path.length > 0) {
      url = new URL(`https://${RAW_HOST}/${[owner, repo, ref, ...path].join('/')}`);
    }
  }

  const filename = decode(url.pathname.split('/').filter(Boolean).pop() ?? '');
  if (!ALLOWED_EXT.has(extOf(filename))) {
    throw new ValidationError('Only .md and .zip files can be imported');
  }
  return { url, filename };
}
