import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// vi.mock() factories are hoisted above top-level const declarations, so the
// mocks referenced inside them must be created via vi.hoisted() — otherwise
// this throws "Cannot access before initialization" regardless of what the
// route does. (Deviation from the brief's verbatim snippet; see Ruling R8 /
// task-2-report.md, which hit the same issue.)
const { pingMock } = vi.hoisted(() => ({
  pingMock: vi.fn().mockResolvedValue('written'),
}));
vi.mock('@/lib/telemetry/install-ping', () => ({ recordInstallPing: pingMock }));

// after() runs its callback immediately in tests so we can assert on it.
vi.mock('next/server', async () => {
  const actual = await vi.importActual<any>('next/server');
  return { ...actual, after: (fn: any) => fn() };
});

// The real route selects 'config, security_config, language' with .eq().single(),
// not .maybeSingle() as the brief's snippet assumed — enriched here so the route
// runs to completion (Ruling: enriching mock scaffolding is fine; assertions unchanged).
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: 'acc-1', config: {}, security_config: {}, language: 'he' } }),
        }),
      }),
    }),
  }),
}));

import { GET } from '@/app/api/widget/config/route';

describe('widget/config install beacon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records a ping carrying the request Origin', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/config?accountId=acc-1', {
      headers: { origin: 'https://argania-oil.co.il', referer: 'https://argania-oil.co.il/shop' },
    });
    await GET(req);
    expect(pingMock).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', origin: 'https://argania-oil.co.il' }),
    );
  });

  it('still returns 200 when the ping throws', async () => {
    pingMock.mockRejectedValueOnce(new Error('boom'));
    const req = new NextRequest('https://bestie.app/api/widget/config?accountId=acc-1', {
      headers: { origin: 'https://argania-oil.co.il' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('does not ping when accountId is missing', async () => {
    const req = new NextRequest('https://bestie.app/api/widget/config');
    await GET(req);
    expect(pingMock).not.toHaveBeenCalled();
  });
});
