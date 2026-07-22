import { describe, it, expect, vi, beforeEach } from 'vitest';

const H: any = { accounts: [], accountsError: null };

// Mirrors the chain the route calls: supabase.from('accounts').select('id')
//   .filter(...).filter(...).filter(...) — three chained JSONB-path filters (AND'd),
// resolving directly to { data, error } (no .then() needed — the route just awaits it).
const filterChain = () => H.accountsError
  ? { data: null, error: H.accountsError }
  : { data: H.accounts, error: null };

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        filter: () => ({
          filter: () => ({
            filter: () => filterChain(),
          }),
        }),
      }),
    }),
  },
}));

const backfillMock = vi.fn();
vi.mock('@/lib/orders/backfill', () => ({
  backfillAccountOrders: (...args: any[]) => backfillMock(...args),
}));

function req(headers: Record<string, string> = {}): any {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } };
}

const AUTH = { authorization: 'Bearer test-cron-secret' };

describe('GET /api/cron/quickshop-order-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    H.accounts = [];
    H.accountsError = null;
  });

  it('401s on bad auth (no backfill attempted)', async () => {
    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(backfillMock).not.toHaveBeenCalled();
  });

  it('401s when CRON_SECRET is not configured, even with a matching header', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req({ authorization: 'Bearer undefined' }));
    expect(res.status).toBe(401);
  });

  it('iterates only the CS-enabled QuickShop accounts the query returns, calling backfillAccountOrders per account with a bounded maxPages', async () => {
    H.accounts = [{ id: 'acc-1' }, { id: 'acc-2' }];
    backfillMock.mockResolvedValue({ imported: 5, pages: 1 });

    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req(AUTH));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.accounts).toBe(2);
    expect(backfillMock).toHaveBeenCalledTimes(2);
    expect(backfillMock).toHaveBeenNthCalledWith(1, 'acc-1', { maxPages: 10 });
    expect(backfillMock).toHaveBeenNthCalledWith(2, 'acc-2', { maxPages: 10 });
    expect(json.synced).toEqual([
      { accountId: 'acc-1', imported: 5, pages: 1 },
      { accountId: 'acc-2', imported: 5, pages: 1 },
    ]);
    expect(json.errors).toEqual([]);
  });

  it('catches a per-account backfill error and continues the sweep for the rest', async () => {
    H.accounts = [{ id: 'acc-bad' }, { id: 'acc-good' }];
    backfillMock.mockImplementation(async (accountId: string) => {
      if (accountId === 'acc-bad') throw new Error('quickshop integration not configured (missing api_key)');
      return { imported: 3, pages: 1 };
    });

    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req(AUTH));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(backfillMock).toHaveBeenCalledTimes(2);
    expect(json.synced).toEqual([{ accountId: 'acc-good', imported: 3, pages: 1 }]);
    expect(json.errors).toEqual([
      { accountId: 'acc-bad', error: 'quickshop integration not configured (missing api_key)' },
    ]);
  });

  it('returns an empty sweep when no accounts are CS-enabled + QuickShop-sourced', async () => {
    H.accounts = [];
    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req(AUTH));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.accounts).toBe(0);
    expect(backfillMock).not.toHaveBeenCalled();
    expect(json.synced).toEqual([]);
    expect(json.errors).toEqual([]);
  });

  it('500s when the account query itself fails', async () => {
    H.accountsError = { message: 'db unavailable' };
    const { GET } = await import('@/app/api/cron/quickshop-order-sync/route');
    const res = await GET(req(AUTH));
    expect(res.status).toBe(500);
    expect(backfillMock).not.toHaveBeenCalled();
  });
});
