import { describe, it, expect, beforeEach, vi } from 'vitest';

// redisSetNx is a SET key value NX EX mutex helper. The shared test setup
// mocks global.fetch and no UPSTASH_* env is loaded, so a live Upstash call is
// impossible here. We mock @upstash/redis with a faithful in-memory fake that
// honors NX+EX semantics, then exercise the REAL redisSetNx from @/lib/redis.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('@upstash/redis', () => {
  class Redis {
    constructor(_opts: unknown) {
      void _opts;
    }
    async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
      if (opts?.nx && store.has(key)) return null; // NX: key already exists → not set
      store.set(key, value);
      return 'OK';
    }
  }
  return { Redis };
});

describe('redisSetNx', () => {
  beforeEach(() => {
    store.clear();
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    vi.resetModules();
  });

  it('returns true first time (lock acquired), false while key exists', async () => {
    const { redisSetNx } = await import('@/lib/redis');
    const key = `test:nx:${Math.floor(performance.now())}`;
    const first = await redisSetNx(key, '1', 30);
    const second = await redisSetNx(key, '1', 30);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('acquires a fresh, previously-unseen key', async () => {
    const { redisSetNx } = await import('@/lib/redis');
    const acquired = await redisSetNx('test:nx:other', 'x', 30);
    expect(acquired).toBe(true);
  });
});
