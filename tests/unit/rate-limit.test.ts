import { describe, it, expect } from 'vitest';
import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit';

describe('Rate Limiting', () => {
  const createConfig = (maxRequests: number): RateLimitConfig => ({
    windowMs: 60 * 1000,
    limit: maxRequests,
  });

  const makeCtx = (key: string) => ({
    accountId: key,
    sessionId: key,
  });

  it('should allow requests under the limit', async () => {
    const result = await checkRateLimit('session', 'chat', makeCtx('test-rl-1'), createConfig(10));
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('should track remaining requests', async () => {
    const ctx = makeCtx('test-rl-2');
    const config = createConfig(5);

    const first = await checkRateLimit('session', 'chat', ctx, config);
    expect(first.remaining).toBe(4);

    const second = await checkRateLimit('session', 'chat', ctx, config);
    expect(second.remaining).toBe(3);
  });

  it('should block when limit exceeded', async () => {
    const ctx = makeCtx('test-rl-3');
    const config = createConfig(2);

    await checkRateLimit('session', 'chat', ctx, config);
    await checkRateLimit('session', 'chat', ctx, config);

    const result = await checkRateLimit('session', 'chat', ctx, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
