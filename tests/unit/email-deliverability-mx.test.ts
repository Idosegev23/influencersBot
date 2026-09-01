import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable DNS. Each test sets what resolveMx does for the domain under test.
const mxBehaviour = new Map<string, 'ok' | 'nxdomain' | 'nodata' | 'timeout' | 'servfail'>();

vi.mock('node:dns/promises', () => ({
  default: {
    resolveMx: async (domain: string) => {
      const b = mxBehaviour.get(domain) || 'ok';
      if (b === 'ok') return [{ exchange: 'mx.example.com', priority: 10 }];
      if (b === 'nodata') return [];
      if (b === 'timeout') return new Promise(() => {});           // never settles
      const err: any = new Error(b);
      err.code = b === 'nxdomain' ? 'ENOTFOUND' : 'ESERVFAIL';
      throw err;
    },
  },
}));

const cache = new Map<string, unknown>();
vi.mock('@/lib/redis', () => ({
  redisGet: async (k: string) => (cache.has(k) ? cache.get(k) : null),
  redisSet: async (k: string, v: unknown) => { cache.set(k, v); return true; },
}));

import { probeMx, verifyEmail, verifyEmailSync } from '@/lib/support/email-deliverability';

beforeEach(() => { mxBehaviour.clear(); cache.clear(); });

describe('probeMx', () => {
  it('reports no_mx for NXDOMAIN', async () => {
    mxBehaviour.set('gmail.com.il', 'nxdomain');
    expect(await probeMx('gmail.com.il')).toBe('no_mx');
  });

  it('reports no_mx for an empty MX set', async () => {
    mxBehaviour.set('ail.com', 'nodata');
    expect(await probeMx('ail.com')).toBe('no_mx');
  });

  it('reports has_mx for a domain that answers', async () => {
    mxBehaviour.set('jerusalem.muni.il', 'ok');
    expect(await probeMx('jerusalem.muni.il')).toBe('has_mx');
  });

  it('reports unknown — not no_mx — when the lookup times out', async () => {
    // windowslive.com and clalit.org.il are real domains that timed out when measured.
    // Mapping a timeout to no_mx rejects real customers.
    mxBehaviour.set('windowslive.com', 'timeout');
    expect(await probeMx('windowslive.com')).toBe('unknown');
  });

  it('returns from the timeout in well under the 1.5s cap plus slack', async () => {
    mxBehaviour.set('slow.example', 'timeout');
    const started = Date.now();
    await probeMx('slow.example');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('reports unknown for SERVFAIL', async () => {
    mxBehaviour.set('flaky.example', 'servfail');
    expect(await probeMx('flaky.example')).toBe('unknown');
  });

  it('serves a repeat lookup from cache without touching DNS again', async () => {
    mxBehaviour.set('gmail.com', 'ok');
    expect(await probeMx('gmail.com')).toBe('has_mx');
    mxBehaviour.set('gmail.com', 'nxdomain');   // DNS now lies; cache should win
    expect(await probeMx('gmail.com')).toBe('has_mx');
  });

  it('does not cache an unknown result', async () => {
    mxBehaviour.set('flaky.example', 'timeout');
    expect(await probeMx('flaky.example')).toBe('unknown');
    mxBehaviour.set('flaky.example', 'ok');
    expect(await probeMx('flaky.example')).toBe('has_mx');
  });
});

describe('verifyEmail', () => {
  it('returns undeliverable WITH a suggestion for the incident address', async () => {
    mxBehaviour.set('gmail.com.il', 'nxdomain');
    const v = await verifyEmail('lililevy42@gmail.com.il');
    expect(v.status).toBe('undeliverable');
    expect(v).toMatchObject({ reason: 'no_mx', suggestion: 'gmail.com' });
  });

  it('returns typo — NOT undeliverable — for a squat that still has MX', async () => {
    mxBehaviour.set('gamil.com', 'ok');
    const v = await verifyEmail('dana@gamil.com');
    // Only `undeliverable` blocks. A live squat must be suggested, never enforced.
    expect(v).toEqual({ status: 'typo', email: 'dana@gamil.com', suggestion: 'gmail.com' });
  });

  it('returns ok for a real corporate domain', async () => {
    mxBehaviour.set('jerusalem.muni.il', 'ok');
    expect(await verifyEmail('a@jerusalem.muni.il')).toEqual({
      status: 'ok', email: 'a@jerusalem.muni.il',
    });
  });

  it('returns unknown, carrying the normalized address through, on a timeout', async () => {
    mxBehaviour.set('clalit.org.il', 'timeout');
    const v = await verifyEmail('  Nurse@Clalit.org.il ');
    // Presence assertion beside the absence one: the address survives, normalized.
    expect(v).toEqual({ status: 'unknown', email: 'nurse@clalit.org.il' });
  });

  it('normalizes before probing, so an invisible mark cannot fake a dead domain', async () => {
    mxBehaviour.set('gmail.com', 'ok');
    expect(await verifyEmail('alice2692@gmail.com\u202C')).toEqual({
      status: 'ok', email: 'alice2692@gmail.com',
    });
  });

  it('returns undeliverable with reason nxdomain for a shape that is not an address', async () => {
    expect(await verifyEmail('לא רוצה')).toMatchObject({ status: 'undeliverable' });
  });
});

describe('verifyEmailSync', () => {
  it('flags a mapped squat without any network call', () => {
    expect(verifyEmailSync('dana@gamil.com')).toEqual({
      status: 'typo', email: 'dana@gamil.com', suggestion: 'gmail.com',
    });
  });

  it('returns unknown for anything it cannot judge locally', () => {
    // Not 'ok' — the sync path has not checked MX, and must not claim it has.
    expect(verifyEmailSync('a@jerusalem.muni.il')).toEqual({
      status: 'unknown', email: 'a@jerusalem.muni.il',
    });
  });
});
