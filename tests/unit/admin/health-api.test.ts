import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Ruling R8: vi.mock factories are hoisted above top-level const declarations,
// so mocks referenced from a factory must themselves be declared inside
// vi.hoisted() or the factory throws a ReferenceError at import time.
const { denyMock, rpcMock } = vi.hoisted(() => ({
  denyMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin-auth', () => ({ requireAdminAuth: denyMock }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: any[]) => rpcMock(...a) } }));

import { GET } from '@/app/api/admin/health/route';

describe('GET /api/admin/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    denyMock.mockResolvedValue(null);
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('401s without an admin session', async () => {
    const { NextResponse } = await import('next/server');
    denyMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    expect(res.status).toBe(401);
  });

  it('sorts worst-first: never_installed above dormant above live', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { account_id: 'a', name: 'Healthy', channels: [{ channel: 'widget', status: 'live' }] },
        { account_id: 'b', name: 'Missing', channels: [{ channel: 'widget', status: 'never_installed' }] },
        { account_id: 'c', name: 'Quiet', channels: [{ channel: 'widget', status: 'dormant' }] },
      ],
      error: null,
    });
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    const body = await res.json();
    expect(body.rows.map((r: any) => r.name)).toEqual(['Missing', 'Quiet', 'Healthy']);
  });

  it('ranks an account by its WORST channel', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { account_id: 'a', name: 'AllGood', channels: [{ channel: 'widget', status: 'live' }] },
        { account_id: 'b', name: 'OneBad', channels: [
          { channel: 'whatsapp', status: 'live' }, { channel: 'widget', status: 'never_installed' },
        ] },
      ],
      error: null,
    });
    const body = await (await GET(new NextRequest('https://x/api/admin/health'))).json();
    expect(body.rows[0].name).toBe('OneBad');
  });

  it('returns an empty list rather than 500 when no contracts exist yet', async () => {
    const res = await GET(new NextRequest('https://x/api/admin/health'));
    expect(res.status).toBe(200);
    expect((await res.json()).rows).toEqual([]);
  });
});
