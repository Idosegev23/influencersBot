/**
 * SSRF guard for URLs that someone outside the team supplies (a partner's
 * association website) and that the server then fetches (scan pipeline).
 *
 * A URL is public when its host is a name (not localhost / *.local / *.internal)
 * and every address it resolves to is a public unicast address: no loopback,
 * private, link-local (cloud metadata), CGNAT, ULA, multicast, documentation or
 * reserved ranges, v4 or v6 (including v4-mapped and NAT64 forms).
 *
 * Limits: the check resolves the name, then fetch resolves it again, so a DNS
 * rebinding attacker with a very short TTL can still win the race. Closing that
 * needs a pinned-address agent; the guard removes the plain cases (a private
 * IP, an internal name, a redirect into the network).
 */
import dns from 'node:dns/promises';
import net from 'node:net';

export type LookupAll = (host: string) => Promise<Array<{ address: string; family: number }>>;
const defaultLookup: LookupAll = (host) => dns.lookup(host, { all: true, verbatim: true });

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function v4Private(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
  });
}

/** Expands an IPv6 address to 8 16-bit groups (handles :: and a dotted v4 tail). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4tail) {
    const n = v4ToInt(v4tail[1]);
    s = s.slice(0, -v4tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  if (s.split('::').length > 2) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  if (fill < 0) return null;
  const parts = [...h, ...Array(fill).fill('0'), ...t];
  if (parts.length !== 8) return null;
  const g = parts.map((p) => parseInt(p || '0', 16));
  return g.some((x) => !Number.isFinite(x) || x < 0 || x > 0xffff) ? null : g;
}
function v6Private(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true; // unparseable: treat as unsafe
  if (g.every((x) => x === 0)) return true;                                  // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;         // ::1
  const embedded = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4Private(embedded(g[6], g[7])); // ::ffff:a.b.c.d
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return v4Private(embedded(g[6], g[7])); // ::ffff:0:a.b.c.d (SIIT)
  if (g.slice(0, 6).every((x) => x === 0)) return true;                       // ::a.b.c.d (deprecated compat)
  if (g[0] === 0x64 && g[1] === 0xff9b) return g.slice(2, 6).every((x) => x === 0) ? v4Private(embedded(g[6], g[7])) : true; // NAT64
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                // fc00::/7 ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true;                                // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;                                // fec0::/10 site-local
  if ((g[0] & 0xff00) === 0xff00) return true;                                // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;                        // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true;    // 100::/64 discard
  if (g[0] === 0x2002) return v4Private(embedded(g[1], g[2]));                // 6to4
  return false;
}

/** True for any address that is not a public unicast address (unparseable counts as private). */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip.replace(/^\[|\]$/g, '').replace(/%.*$/, ''));
  if (kind === 4) return v4Private(ip);
  if (kind === 6) return v6Private(ip);
  return true;
}

const BLOCKED_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa|intranet|lan|corp)$/i;

export type PublicUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export const LOOKUP_TIMEOUT_MS = 3000;
const LOOKUP_TTL_MS = 60_000;
type Addrs = Array<{ address: string; family: number }>;
/** Per-lookup-function memo, so one crawl resolves each host once a minute (failures are not cached). */
const memo = new WeakMap<LookupAll, Map<string, { addrs: Addrs; until: number }>>();

/** Resolves `host` within `timeoutMs`, giving up early when `signal` aborts. */
async function resolveHost(host: string, lookup: LookupAll, timeoutMs: number, signal?: AbortSignal | null): Promise<Addrs> {
  let cache = memo.get(lookup);
  if (!cache) { cache = new Map(); memo.set(lookup, cache); }
  const hit = cache.get(host);
  if (hit && hit.until > Date.now()) return hit.addrs;
  if (signal?.aborted) throw new Error('aborted');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const addrs = await Promise.race([
      lookup(host),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('lookup timeout')), timeoutMs); }),
      new Promise<never>((_, reject) => {
        if (!signal) return;
        onAbort = () => reject(new Error('aborted'));
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
    cache.set(host, { addrs, until: Date.now() + LOOKUP_TTL_MS });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return addrs;
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Checks one URL. The defaults are the strict rules for a partner-supplied website:
 * a name (no IP literal) on port 80/443. Crawl fetches relax both
 * (`allowIpLiteral`, `anyPort`); the address checks always apply.
 */
export async function checkPublicUrl(
  raw: string,
  opts: { allowIpLiteral?: boolean; anyPort?: boolean; lookup?: LookupAll; timeoutMs?: number; signal?: AbortSignal | null } = {},
): Promise<PublicUrlCheck> {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'unparseable' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (!opts.anyPort && u.port && u.port !== '80' && u.port !== '443') return { ok: false, reason: 'port' };
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host) return { ok: false, reason: 'host' };
  if (net.isIP(host)) {
    if (!opts.allowIpLiteral) return { ok: false, reason: 'ip_literal' };
    return isPrivateAddress(host) ? { ok: false, reason: 'private_address' } : { ok: true, url: u };
  }
  if (!host.includes('.') || BLOCKED_NAME.test(host)) return { ok: false, reason: 'internal_name' };
  let addrs: Array<{ address: string }>;
  try {
    addrs = await resolveHost(host, opts.lookup ?? defaultLookup, opts.timeoutMs ?? LOOKUP_TIMEOUT_MS, opts.signal);
  } catch { return { ok: false, reason: 'unresolvable' }; }
  if (!addrs?.length) return { ok: false, reason: 'unresolvable' };
  if (addrs.some((a) => isPrivateAddress(a.address))) return { ok: false, reason: 'private_address' };
  return { ok: true, url: u };
}

export class BlockedUrlError extends Error {
  constructor(public url: string, public reason: string) { super(`blocked url (${reason})`); }
}

/**
 * fetch() that refuses non-public targets, including every redirect hop
 * (redirects are followed manually, at most `maxRedirects`, default 10). Any port.
 */
export async function fetchPublic(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number; lookup?: LookupAll; fetchImpl?: typeof fetch; lookupTimeoutMs?: number } = {},
): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const max = opts.maxRedirects ?? 10;
  let current = url;
  for (let hop = 0; ; hop++) {
    const c = await checkPublicUrl(current, {
      allowIpLiteral: true, anyPort: true, lookup: opts.lookup, timeoutMs: opts.lookupTimeoutMs, signal: init.signal,
    });
    if (c.ok === false) throw new BlockedUrlError(current, c.reason);
    const res = await f(current, { ...init, redirect: 'manual' });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!loc) return res;
    if (hop >= max) throw new BlockedUrlError(current, 'too_many_redirects');
    try { await res.body?.cancel(); } catch { /* ignore */ }
    current = new URL(loc, current).href;
  }
}
