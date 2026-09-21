import { isIP } from 'node:net';

/**
 * Which IP addresses an outbound fetch must never connect to: loopback, private,
 * link-local (cloud metadata lives at 169.254.169.254), CGNAT, unique-local, multicast,
 * reserved, and every IPv6 form that embeds one of those. Anything that does not parse
 * is blocked (fail closed).
 */

type Cidr4 = [base: string, bits: number];

const BLOCKED_V4: Cidr4[] = [
  ['0.0.0.0', 8], // "this" network, 0.0.0.0
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, 255.255.255.255
];

function v4ToInt(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return undefined;
    n = n * 256 + Number(p);
  }
  return n;
}

function inCidr4(n: number, [base, bits]: Cidr4): boolean {
  const b = v4ToInt(base)!;
  const size = 2 ** (32 - bits);
  return Math.floor(n / size) === Math.floor(b / size);
}

function blockedV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return n === undefined || BLOCKED_V4.some((c) => inCidr4(n, c));
}

/** Eight 16-bit groups, or undefined. Handles `::` and a trailing dotted IPv4. */
function parseV6(input: string): number[] | undefined {
  let ip = input.split('%')[0]!;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    if (n === undefined) return undefined;
    ip = ip.slice(0, -tail[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return undefined;
  const toGroups = (s: string) => (s === '' ? [] : s.split(':'));
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return undefined;
  const all = [...head, ...Array<string>(fill).fill('0'), ...rest];
  if (all.length !== 8) return undefined;
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? undefined : nums;
}

/** The IPv4 address held in two groups. */
const embeddedV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

function blockedV6(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true;
  const [a, b, c, d, e, f, hi, lo] = g as [number, number, number, number, number, number, number, number];
  const firstFiveZero = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;
  if (firstFiveZero && f === 0 && hi === 0 && (lo === 0 || lo === 1)) return true; // :: and ::1
  if (firstFiveZero && (f === 0xffff || f === 0)) return blockedV4(embeddedV4(hi, lo)); // ::ffff:a.b.c.d, ::a.b.c.d
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return blockedV4(embeddedV4(hi, lo)); // 64:ff9b::/96 NAT64
  }
  if (a === 0x2002) return blockedV4(embeddedV4(b, c)); // 6to4
  if (a === 0x2001 && b === 0) return true; // Teredo
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip.split('%')[0]!);
  if (kind === 4) return blockedV4(ip);
  if (kind === 6) return blockedV6(ip);
  return true;
}
