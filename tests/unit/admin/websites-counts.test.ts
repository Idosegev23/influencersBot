import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above top-level consts, so anything the factory
// references must live in vi.hoisted() (same rule as admin/health-api.test.ts).
const { denyMock, fromMock, rpcMock } = vi.hoisted(() => ({
  denyMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: denyMock }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: (...a: any[]) => fromMock(...a), rpc: (...a: any[]) => rpcMock(...a) }),
}));

import { GET } from '@/app/api/admin/websites/route';

const site = (id: string, domain: string) => ({
  id,
  language: 'he',
  config: { display_name: domain, widget: { domain, enabled: true } },
});

/** Minimal PostgREST-ish builder for the one `accounts` select the route makes. */
function accountsTable(rows: any[]) {
  const b: any = {
    select: () => b,
    eq: () => b,
    not: () => b,
    then: (res: any) => Promise.resolve({ data: rows, error: null }).then(res),
  };
  return b;
}

describe('GET /api/admin/websites — per-account counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    denyMock.mockResolvedValue(null);
  });

  it('fetches every account’s counts in ONE query, not one per account', async () => {
    // The 23s bug: 3 exact-count queries ran inside a sequential `for..of await`
    // over 44 accounts = 132 queries in 44 serial round trips. Ten accounts here
    // would have meant 30 count queries; the batched version issues exactly one.
    const rows = Array.from({ length: 10 }, (_, i) => site(`id-${i}`, `s${i}.com`));
    fromMock.mockImplementation(() => accountsTable(rows));
    rpcMock.mockResolvedValue({
      data: rows.map((r) => ({ account_id: r.id, pages: 5, chunks: 50, products: 2 })),
      error: null,
    });

    const res = await GET();
    const body = await res.json();

    // Presence first: the response must actually carry the ten sites with their
    // real counts. Asserting only the call count would pass on an empty body.
    expect(body.websites).toHaveLength(10);
    expect(body.websites.every((w: any) => w.pagesCount === 5 && w.chunksCount === 50)).toBe(true);
    // ...and it took one counts round trip, not ten.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(1); // the accounts select only
  });

  it('attributes each count to the right account', async () => {
    const rows = [site('aaa', 'alpha.com'), site('bbb', 'beta.com')];
    fromMock.mockImplementation(() => accountsTable(rows));
    // Deliberately returned in the opposite order to the accounts list: a fix
    // that zips two arrays positionally instead of joining on id passes the
    // count-total assertions above but swaps these numbers.
    rpcMock.mockResolvedValue({
      data: [
        { account_id: 'bbb', pages: 200, chunks: 2000, products: 20 },
        { account_id: 'aaa', pages: 100, chunks: 1000, products: 10 },
      ],
      error: null,
    });

    const body = await (await GET()).json();
    const byId = Object.fromEntries(body.websites.map((w: any) => [w.id, w]));

    expect(byId.aaa.pagesCount).toBe(100);
    expect(byId.aaa.chunksCount).toBe(1000);
    expect(byId.bbb.pagesCount).toBe(200);
    expect(byId.bbb.chunksCount).toBe(2000);
  });

  it('reports chunk counts far above PostgREST’s 1000-row page cap', async () => {
    // document_chunks holds 124,657 rows live. Counting by selecting the rows
    // and measuring array length silently caps at 1000 and under-reports.
    const rows = [site('big', 'big.com')];
    fromMock.mockImplementation(() => accountsTable(rows));
    rpcMock.mockResolvedValue({
      data: [{ account_id: 'big', pages: 3400, chunks: 12465, products: 1200 }],
      error: null,
    });

    const body = await (await GET()).json();
    expect(body.websites[0].chunksCount).toBe(12465);
    expect(body.websites[0].pagesCount).toBe(3400);
    expect(body.websites[0].productsCount).toBe(1200);
  });

  it('gives an account with no documents a zero, not undefined', async () => {
    const rows = [site('empty', 'empty.com'), site('full', 'full.com')];
    fromMock.mockImplementation(() => accountsTable(rows));
    // A grouped aggregate returns no row at all for an account with no rows.
    rpcMock.mockResolvedValue({
      data: [{ account_id: 'full', pages: 7, chunks: 70, products: 1 }],
      error: null,
    });

    const body = await (await GET()).json();
    const empty = body.websites.find((w: any) => w.id === 'empty');

    expect(empty.pagesCount).toBe(0);
    expect(empty.chunksCount).toBe(0);
    expect(empty.productsCount).toBe(0);
    // The account with rows still reports them — proves the zeroing is not
    // blanket-defaulting every account to 0.
    expect(body.websites.find((w: any) => w.id === 'full').chunksCount).toBe(70);
  });

  it('still returns the sites when the counts query fails', async () => {
    // Capability badges are decoration; losing them must not blank the admin's
    // widget toggles, which are the reason the page exists.
    const rows = [site('aaa', 'alpha.com')];
    fromMock.mockImplementation(() => accountsTable(rows));
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.websites).toHaveLength(1);
    expect(body.websites[0].domain).toBe('alpha.com');
    expect(body.websites[0].enabled).toBe(true);
    expect(body.websites[0].chunksCount).toBe(0);
  });
});
