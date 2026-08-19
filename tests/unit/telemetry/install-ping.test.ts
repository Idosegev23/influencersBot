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

  // Fix 3 (whole-branch review, 2026-08-19), amended by Ruling R19: our own
  // preview/demo/editor surfaces load the real widget.js against a real
  // account-id — that must never manufacture install evidence. Origin
  // identity (self-load) is the ONLY signal used — see the comment on
  // recordInstallPing for why a referer-path check was tried and removed.
  describe('preview-surface filtering (Fix 3 / R19)', () => {
    beforeEach(() => {
      redisMock.isRedisAvailable.mockReturnValue(true);
      redisMock.redisSetNx.mockResolvedValue(true);
    });

    it('still records a genuine customer origin, distinct from our own app', async () => {
      const r = await recordInstallPing({
        accountId: 'acc-1',
        origin: 'https://argania-oil.co.il',
        referer: 'https://argania-oil.co.il/products/oil',
        path: '/products/oil',
        widgetVersion: '4.0',
        requestOrigin: 'https://app.bestie.ai',
      });
      expect(r).toBe('written');
      expect(rpcMock).toHaveBeenCalledOnce();
    });

    it('skips when the ping origin equals the origin serving this request (self-load)', async () => {
      // /demo/[id] and /widget-preview load widget.js via
      // `${window.location.origin}/widget.js` — the browser's Origin header
      // on the resulting /api/widget/config fetch is therefore our own app's
      // origin, whatever domain alias is currently serving it.
      const r = await recordInstallPing({
        accountId: 'acc-1',
        origin: 'https://app.bestie.ai',
        referer: 'https://app.bestie.ai/demo/acc-1',
        path: '/demo/acc-1',
        widgetVersion: '4.0',
        requestOrigin: 'https://app.bestie.ai',
      });
      expect(r).toBe('skipped');
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('skips a self-load even under a customer-branded domain alias (production evidence)', async () => {
      // Verified in production: origin https://bestie.ldrsgroup.com, sample_path
      // /api/widget/preview/de38eac6-... — admin previewing LDRS's own widget
      // under a branded alias. The self-referential check (origin ===
      // requestOrigin) still catches this because both sides resolve to
      // whatever alias is currently serving the app, not a hardcoded domain.
      const r = await recordInstallPing({
        accountId: 'acc-1',
        origin: 'https://bestie.ldrsgroup.com',
        referer: 'https://bestie.ldrsgroup.com/api/widget/preview/acc-1',
        path: '/api/widget/preview/acc-1',
        widgetVersion: '4.0',
        requestOrigin: 'https://bestie.ldrsgroup.com',
      });
      expect(r).toBe('skipped');
      expect(rpcMock).not.toHaveBeenCalled();
    });

    // Ruling R19 regression coverage: a referer-path check (removed) would
    // have silently swallowed these. `path` is the pathname of the
    // CUSTOMER'S OWN page, not ours — a "book a demo" landing page under
    // /demo/... or a back-office under /admin/... on the customer's own
    // domain must still be RECORDED, because the request's actual origin is
    // genuinely the customer's, not ours.
    it('records a genuine customer origin even when its own page path starts with /admin/', async () => {
      const r = await recordInstallPing({
        accountId: 'acc-1',
        origin: 'https://argania-oil.co.il',
        referer: 'https://argania-oil.co.il/admin/inventory',
        path: '/admin/inventory',
        widgetVersion: '4.0',
        requestOrigin: 'https://app.bestie.ai',
      });
      expect(r).toBe('written');
      expect(rpcMock).toHaveBeenCalledOnce();
    });

    it('records a genuine customer origin even when its own page path starts with /demo/', async () => {
      const r = await recordInstallPing({
        accountId: 'acc-1',
        origin: 'https://studiopasha.co.il',
        referer: 'https://studiopasha.co.il/demo/book-a-call',
        path: '/demo/book-a-call',
        widgetVersion: '4.0',
        requestOrigin: 'https://app.bestie.ai',
      });
      expect(r).toBe('written');
      expect(rpcMock).toHaveBeenCalledOnce();
    });
  });
});
