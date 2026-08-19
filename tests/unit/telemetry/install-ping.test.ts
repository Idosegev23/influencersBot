import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() factories are hoisted above top-level const declarations, so the
// mocks referenced inside them must be created via vi.hoisted() — otherwise
// this throws "Cannot access 'redisMock' before initialization" regardless of
// what install-ping.ts does. (Deviation from the brief's verbatim snippet,
// which hits this ReferenceError; see task-2-report.md.)
const { redisMock, rpcMock } = vi.hoisted(() => ({
  redisMock: { redisSetNx: vi.fn(), isRedisAvailable: vi.fn() },
  rpcMock: vi.fn(),
}));
vi.mock('@/lib/redis', () => redisMock);
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpcMock(...a) } }));

import { normalizeOrigin, recordInstallPing } from '@/lib/telemetry/install-ping';

describe('normalizeOrigin', () => {
  it('keeps scheme + host, drops path and port-less noise', () => {
    expect(normalizeOrigin('https://argania-oil.co.il', null)).toBe('https://argania-oil.co.il');
  });

  it('lowercases the host', () => {
    expect(normalizeOrigin('https://Argania-Oil.CO.IL', null)).toBe('https://argania-oil.co.il');
  });

  it('falls back to the Referer host when Origin is absent', () => {
    expect(normalizeOrigin(null, 'https://studiopasha.co.il/products/x?utm=1'))
      .toBe('https://studiopasha.co.il');
  });

  it('prefers Origin over Referer when both are present', () => {
    expect(normalizeOrigin('https://a.com', 'https://b.com/x')).toBe('https://a.com');
  });

  it('rejects the literal "null" origin sent by sandboxed iframes', () => {
    expect(normalizeOrigin('null', null)).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(normalizeOrigin('file://', null)).toBeNull();
  });

  it('returns null when both headers are missing', () => {
    expect(normalizeOrigin(null, null)).toBeNull();
  });
});

describe('recordInstallPing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it('writes when it wins the Redis dedupe window', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null,
      path: '/products', widgetVersion: '4.0',
    });
    expect(r).toBe('written');
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it('skips the write when another request already claimed this minute', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(false);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    });
    expect(r).toBe('deduped');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('STILL WRITES when Redis is unavailable — setNx also returns false there', async () => {
    redisMock.isRedisAvailable.mockReturnValue(false);
    redisMock.redisSetNx.mockResolvedValue(false);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    });
    expect(r).toBe('written');
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it('skips entirely when no usable origin can be derived', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    const r = await recordInstallPing({
      accountId: 'acc-1', origin: null, referer: null, path: '/', widgetVersion: null,
    });
    expect(r).toBe('skipped');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('strips the query string from the sample path', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    await recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null,
      path: '/checkout?email=someone@example.com', widgetVersion: '4.0',
    });
    expect(rpcMock.mock.calls[0][1].p_sample_path).toBe('/checkout');
  });

  it('never throws when the database write fails', async () => {
    redisMock.isRedisAvailable.mockReturnValue(true);
    redisMock.redisSetNx.mockResolvedValue(true);
    rpcMock.mockRejectedValue(new Error('db down'));
    await expect(recordInstallPing({
      accountId: 'acc-1', origin: 'https://a.com', referer: null, path: '/', widgetVersion: '4.0',
    })).resolves.toBe('skipped');
  });
});
