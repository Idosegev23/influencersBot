import { describe, it, expect, beforeAll } from 'vitest';
import { redisRPush, redisLPopCount, redisLLen } from '@/lib/redis';

describe('redis buffer helpers (degraded path)', () => {
  beforeAll(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; });
  it('RPUSH returns 0 when Redis unavailable', async () => { expect(await redisRPush('k', ['a'])).toBe(0); });
  it('LPOP returns [] when Redis unavailable', async () => { expect(await redisLPopCount('k', 5)).toEqual([]); });
  it('LLEN returns 0 when Redis unavailable', async () => { expect(await redisLLen('k')).toBe(0); });
  it('RPUSH of empty array is a no-op 0', async () => { expect(await redisRPush('k', [])).toBe(0); });
});
