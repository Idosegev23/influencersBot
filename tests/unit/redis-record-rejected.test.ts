// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const zsets = new Map<string, Map<string, number>>();
vi.mock('@upstash/redis', () => ({
  Redis: class {
    pipeline() {
      const ops: Array<() => unknown> = [];
      const p: any = {
        zremrangebyscore: (k: string, _a: number, max: number) => { ops.push(() => { const z = zsets.get(k); if (z) for (const [m, sc] of z) if (sc <= max) z.delete(m); return 0; }); return p; },
        zcard: (k: string) => { ops.push(() => zsets.get(k)?.size ?? 0); return p; },
        zadd: (k: string, e: { score: number; member: string }) => { ops.push(() => { if (!zsets.has(k)) zsets.set(k, new Map()); zsets.get(k)!.set(e.member, e.score); return 1; }); return p; },
        expire: () => { ops.push(() => 1); return p; },
        exec: async () => ops.map((o) => o()),
      };
      return p;
    }
    async zrange(k: string) { const z = [...(zsets.get(k) ?? new Map())].sort((a, b) => a[1] - b[1]); return z.slice(0, 1).map(([member, score]) => ({ member, score })); }
    async zrem(k: string, m: string) { return zsets.get(k)?.delete(m) ? 1 : 0; }
  },
}));

beforeEach(() => {
  zsets.clear();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 't';
});

describe('redisSlidingWindowRateLimit recordRejected', () => {
  it('by default a refused request still counts; with recordRejected:false it does not', async () => {
    const { redisSlidingWindowRateLimit: rl } = await import('@/lib/redis');
    const call = (key: string, id: string, recordRejected?: boolean) => rl({ key, limit: 2, windowMs: 60_000, identifier: id, recordRejected });
    for (const k of ['default', 'norecord']) { await call(k, 'a'); await call(k, 'b'); }
    for (let i = 0; i < 5; i++) {
      expect((await call('default', `d${i}`))!.allowed).toBe(false);
      expect((await call('norecord', `n${i}`, false))!.allowed).toBe(false);
    }
    expect(zsets.get('default')!.size).toBe(7);
    expect(zsets.get('norecord')!.size).toBe(2);
  });
});
