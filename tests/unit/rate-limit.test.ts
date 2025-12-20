import { describe, it, expect } from 'vitest';
import { checkRateLimit, type RateLimitConfig } from '@/lib/rate-limit';

describe('Rate Limiting', () => {
  const createConfig = (maxRequests: number): RateLimitConfig => ({
    windowMs: 60 * 1000,
    maxRequests,
  });

  it('should allow requests under the limit', () => {
    const result = checkRateLimit('test-key-1', createConfig(10));
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('should track remaining requests', () => {
    const key = 'test-key-2';
    const config = createConfig(5);
    
    const first = checkRateLimit(key, config);
    expect(first.remaining).toBe(4);
    
    const second = checkRateLimit(key, config);
    expect(second.remaining).toBe(3);
  });

  it('should block when limit exceeded', () => {
    const key = 'test-key-3';
    const config = createConfig(2);

    checkRateLimit(key, config);
    checkRateLimit(key, config);
    
    const result = checkRateLimit(key, config);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

