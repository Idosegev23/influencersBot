// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { checkChatLimits } from '@/lib/copilot/rate-limit';

const ok = { allowed: true, remaining: 5, resetAt: 0, retryAfterMs: 0 };
const ctx = { accountId: 'acc', anonId: 'anon_aaaaaaaaaaaaaaaa' };

describe('checkChatLimits', () => {
  it('allows when both buckets allow', async () => {
    const limiter = vi.fn(async () => ok);
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toEqual({ allowed: true });
    expect(limiter).toHaveBeenCalledTimes(2);
    expect(limiter.mock.calls.map((c: any) => c[0].key)).toEqual([
      'rl:copilot:chat:anon:acc:anon_aaaaaaaaaaaaaaaa',
      'rl:copilot:chat:account:acc',
    ]);
    expect(limiter.mock.calls.map((c: any) => c[0].limit)).toEqual([20, 300]);
  });
  it('refuses 429 when the anon bucket is full', async () => {
    const limiter = vi.fn(async (a: any) => (a.key.includes(':anon:') ? { ...ok, allowed: false, retryAfterMs: 4000 } : ok));
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toEqual({ allowed: false, status: 429, error: 'rate_limited', retryAfterMs: 4000 });
  });
  it('refuses 429 when the association bucket is full', async () => {
    const limiter = vi.fn(async (a: any) => (a.key.includes(':account:') ? { ...ok, allowed: false, retryAfterMs: 900 } : ok));
    expect(await checkChatLimits(ctx, { limiter, available: () => true })).toMatchObject({ allowed: false, status: 429 });
  });
  it('fails closed when Redis is unavailable or the limiter errors', async () => {
    expect(await checkChatLimits(ctx, { limiter: vi.fn(async () => ok), available: () => false }))
      .toEqual({ allowed: false, status: 503, error: 'rate_limiter_unavailable', retryAfterMs: 5000 });
    expect(await checkChatLimits(ctx, { limiter: vi.fn(async () => null), available: () => true }))
      .toMatchObject({ allowed: false, status: 503 });
  });
});
