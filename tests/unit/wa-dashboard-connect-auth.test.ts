import { describe, it, expect, vi, beforeEach } from 'vitest';

// The dashboard card calls /api/influencer/<username>/whatsapp with the username in the PATH
// and no ?username= query. Auth used to read only the query, so every call — including LA
// BEAUTÉ's real connect on 2026-10-11 — died as 400 "Username required" before doing anything.

let sessionValid = true;
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'tok' }) }) }));
vi.mock('@/lib/auth/session-token', () => ({
  verifySessionToken: () => sessionValid,
  influencerSubject: (u: string) => `influencer:${u}`,
}));
vi.mock('@/lib/auth/agent-auth', () => ({ getAgentSession: vi.fn(async () => null) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {},
  getInfluencerByUsername: vi.fn(async (u: string) => (u === 'labeaute.israel' ? { id: 'acc-lb' } : null)),
}));

const connected: string[] = [];
vi.mock('@/lib/whatsapp-cloud/connect-account', () => ({
  connectAccountFromSignup: vi.fn(async (accountId: string) => { connected.push(accountId); return { status: 200, body: { ok: true } }; }),
  channelStatus: vi.fn(async () => ({ status: 404, body: { error: 'not_found' } })),
  probeChannelBilling: vi.fn(async () => ({ status: 200, body: { paymentReady: false } })),
}));

const ctx = { params: Promise.resolve({ username: 'labeaute.israel' }) };
const url = 'https://bestie.ldrsgroup.com/api/influencer/labeaute.israel/whatsapp';

beforeEach(() => { connected.length = 0; sessionValid = true; });

describe('dashboard WhatsApp connect auth reads the username from the path', () => {
  it('connects the path account with no ?username= in the URL', async () => {
    const { POST } = await import('@/app/api/influencer/[username]/whatsapp/route');
    const res = await POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'C', waba_id: 'W' }),
    }) as any, ctx);
    expect(res.status).toBe(200);
    expect(connected).toEqual(['acc-lb']);
  });

  it('billing status reaches the channel lookup (404 = no channel), not a 400', async () => {
    const { GET } = await import('@/app/api/influencer/[username]/whatsapp/billing/route');
    const res = await GET(new Request(`${url}/billing`) as any, ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('still refuses without a valid session', async () => {
    sessionValid = false;
    const { POST } = await import('@/app/api/influencer/[username]/whatsapp/route');
    const res = await POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'C', waba_id: 'W' }),
    }) as any, ctx);
    expect(res.status).toBe(401);
    expect(connected).toEqual([]);
  });
});
