// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isPrivateAddress, checkPublicUrl, fetchPublic, BlockedUrlError } from '@/lib/copilot/public-url';

const dnsTable: Record<string, string[]> = {
  'buses.org': ['104.18.2.3'],
  'mixed.test': ['104.18.2.3', '10.0.0.5'],
  'meta.test': ['169.254.169.254'],
  'v6ula.test': ['fd00:ec2::254'],
  'v6ok.test': ['2606:4700::6810:203'],
  'mapped.test': ['::ffff:127.0.0.1'],
};
const lookup = async (h: string) => {
  const a = dnsTable[h];
  if (!a) throw new Error('ENOTFOUND');
  return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::ffff:0:127.0.0.1', '::ffff:0:a9fe:a9fe', '::ffff:0:10.0.0.1',
    '::', '::1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2001:db8::1', '2002:0a00:0001::1',
    'not-an-ip',
  ])('%s is private', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '104.18.2.3', '172.32.0.1', '100.128.0.1', '2606:4700::6810:203', '::ffff:8.8.8.8', '::ffff:0:8.8.8.8', '64:ff9b::808:808'])('%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('checkPublicUrl', () => {
  it('a public name passes', async () => {
    expect((await checkPublicUrl('https://buses.org/x', { lookup })).ok).toBe(true);
    expect((await checkPublicUrl('https://v6ok.test/', { lookup })).ok).toBe(true);
  });
  it.each([
    ['http://127.0.0.1/', 'ip_literal'],
    ['http://8.8.8.8/', 'ip_literal'],
    ['http://[::1]/', 'ip_literal'],
    ['http://localhost/', 'internal_name'],
    ['http://app.localhost/', 'internal_name'],
    ['http://printer.local/', 'internal_name'],
    ['http://metadata.google.internal/', 'internal_name'],
    ['http://mixed.test/', 'private_address'],
    ['http://meta.test/', 'private_address'],
    ['http://v6ula.test/', 'private_address'],
    ['http://mapped.test/', 'private_address'],
    ['http://nowhere.test/', 'unresolvable'],
    ['ftp://buses.org/', 'scheme'],
    ['http://user:pw@buses.org/', 'credentials'],
    ['http://buses.org:6379/', 'port'],
  ])('%s is refused (%s)', async (url, reason) => {
    expect(await checkPublicUrl(url, { lookup })).toEqual({ ok: false, reason });
  });
  it('a public IP literal is allowed only when asked', async () => {
    expect((await checkPublicUrl('http://8.8.8.8/', { lookup, allowIpLiteral: true })).ok).toBe(true);
    expect((await checkPublicUrl('http://10.0.0.1/', { lookup, allowIpLiteral: true })).ok).toBe(false);
  });
});

describe('fetchPublic', () => {
  it('follows a redirect between public hosts', async () => {
    const f = vi.fn(async (u: any) => (String(u).includes('/a')
      ? new Response(null, { status: 301, headers: { location: '/b' } })
      : new Response('ok', { status: 200 })));
    const res = await fetchPublic('https://buses.org/a', {}, { lookup, fetchImpl: f as any });
    expect(await res.text()).toBe('ok');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toBe('https://buses.org/b');
    expect((f.mock.calls[0] as any)[1].redirect).toBe('manual');
  });
  it('refuses a redirect into the network, never fetching it', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    await expect(fetchPublic('https://buses.org/', {}, { lookup, fetchImpl: f as any })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('refuses a private first hop without fetching', async () => {
    const f = vi.fn();
    await expect(fetchPublic('http://meta.test/', {}, { lookup, fetchImpl: f as any })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(f).not.toHaveBeenCalled();
  });
  it('stops after too many redirects', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));
    await expect(fetchPublic('https://buses.org/', {}, { lookup, fetchImpl: f as any, maxRedirects: 3 })).rejects.toThrow(/too_many_redirects/);
    expect(f).toHaveBeenCalledTimes(4);
  });
});

describe('fetchPublic (round 2)', () => {
  it('allows any port for crawl fetches; the strict website check keeps 80/443', async () => {
    const f = vi.fn(async () => new Response('ok', { status: 200 }));
    await fetchPublic('https://buses.org:8443/x', {}, { lookup, fetchImpl: f as any });
    expect(f).toHaveBeenCalledTimes(1);
    expect(await checkPublicUrl('https://buses.org:8443/x', { lookup })).toEqual({ ok: false, reason: 'port' });
  });

  it('follows up to 10 redirects, refuses the 11th', async () => {
    let n = 0;
    const f = vi.fn(async () => (++n <= 10 ? new Response(null, { status: 302, headers: { location: `/r${n}` } }) : new Response('done', { status: 200 })));
    expect(await (await fetchPublic('https://buses.org/', {}, { lookup, fetchImpl: f as any })).text()).toBe('done');
    const g = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));
    await expect(fetchPublic('https://buses.org/', {}, { lookup, fetchImpl: g as any })).rejects.toThrow(/too_many_redirects/);
    expect(g).toHaveBeenCalledTimes(11);
  });

  it('caches lookups per host (one lookup for a redirect chain on one host)', async () => {
    const lk = vi.fn(lookup);
    let n = 0;
    const f = vi.fn(async () => (++n <= 3 ? new Response(null, { status: 301, headers: { location: `/p${n}` } }) : new Response('ok', { status: 200 })));
    await fetchPublic('https://buses.org/', {}, { lookup: lk, fetchImpl: f as any });
    await fetchPublic('https://buses.org/again', {}, { lookup: lk, fetchImpl: f as any });
    expect(lk).toHaveBeenCalledTimes(1);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('a hanging DNS lookup gives up after the timeout, never fetching', async () => {
    const hang = vi.fn(() => new Promise<any>(() => {}));
    const f = vi.fn();
    const t0 = Date.now();
    await expect(fetchPublic('https://slow-dns.test/', {}, { lookup: hang, fetchImpl: f as any, lookupTimeoutMs: 50 })).rejects.toBeInstanceOf(BlockedUrlError);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(f).not.toHaveBeenCalled();
  });

  it('an aborted request signal stops a pending lookup', async () => {
    const hang = vi.fn(() => new Promise<any>(() => {}));
    const ctrl = new AbortController();
    const p = fetchPublic('https://slow-dns2.test/', { signal: ctrl.signal }, { lookup: hang, fetchImpl: vi.fn() as any, lookupTimeoutMs: 10_000 });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(BlockedUrlError);
  });
});
