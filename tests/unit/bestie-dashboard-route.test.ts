import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth: vi.fn(async () => ({
    authorized: true as const,
    username: 'argania',
    accountId: 'A1',
    influencer: { id: 'A1', language: 'he' },
    response: null,
  })),
  turn: vi.fn(async () => ({ reply: 'שלום' })),
}));

vi.mock('@/lib/auth/influencer-auth', () => ({ requireInfluencerAuth: h.auth }));
vi.mock('@/lib/bestie/dashboard/dashboard-agent', () => ({ runDashboardTurn: h.turn }));

import { POST } from '@/app/api/bestie/dashboard/route';

const post = (body: any, username = 'argania') =>
  POST(new Request(`https://x/api/bestie/dashboard?username=${username}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any);

beforeEach(() => { h.turn.mockClear(); });

describe('POST /api/bestie/dashboard', () => {
  it('answers an authenticated request', async () => {
    const res = await post({
      username: 'argania',
      message: 'איפה המתג?',
      currentPath: '/influencer/argania/chatbot-settings',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('שלום');
  });

  it('takes the account from the session, never from the body', async () => {
    await post({
      username: 'argania',
      message: 'x',
      accountId: 'SOMEONE-ELSE',
      account_id: 'SOMEONE-ELSE',
    });
    const ctx = (h.turn.mock.calls[0] as any)[0].ctx;
    expect(ctx.accountId).toBe('A1');
    expect(ctx.accountId).not.toBe('SOMEONE-ELSE');
  });

  it('normalises the current path into a route-tree route', async () => {
    await post({
      username: 'argania',
      message: 'x',
      currentPath: '/influencer/argania/analytics?tab=1',
    });
    expect((h.turn.mock.calls[0] as any)[0].ctx.currentRoute)
      .toBe('/influencer/[username]/analytics');
  });

  it('rejects an unauthenticated caller', async () => {
    h.auth.mockResolvedValueOnce({
      authorized: false as const,
      username: 'argania',
      influencer: null,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as any);
    expect((await post({ username: 'argania', message: 'x' })).status).toBe(401);
    expect(h.turn).not.toHaveBeenCalled();
  });

  it('rejects an empty message before touching auth or the brain', async () => {
    expect((await post({ username: 'argania', message: '   ' })).status).toBe(400);
    expect(h.turn).not.toHaveBeenCalled();
  });

  it('passes the request through so auth can read ?username= from the URL', async () => {
    // Regression: the widget originally sent username in the BODY, and this
    // suite passed anyway because it mocks requireInfluencerAuth — the mock hid
    // the real contract (extractUsername reads searchParams only). Live traffic
    // got "Username required" on every call.
    h.auth.mockClear();
    await post({ message: 'x' }, 'studiopasha_fashion');
    const reqPassedToAuth = (h.auth.mock.calls[0] as any)[0];
    expect(new URL(reqPassedToAuth.url).searchParams.get('username'))
      .toBe('studiopasha_fashion');
  });
});
