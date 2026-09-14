/**
 * The Instagram connect flow signs the accountId into the /connect link, but
 * /callback then read accountId from the OAuth `state` param — plain JSON the
 * browser carries back. Anyone could start Instagram OAuth themselves with
 * state={"accountId":"<victim uuid>"} and the callback would attach THEIR
 * Instagram to the victim account and deactivate the victim's real
 * connection (audit 2026-09-02, HIGH). The state must be signed too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.INSTAGRAM_APP_ID = 'ig-app-id';
process.env.INSTAGRAM_APP_SECRET = 'ig-app-secret';
process.env.SESSION_COOKIE_SECRET ||= 'test-session-secret';

vi.mock('@/lib/instagram-graph/subscribe', () => ({ subscribeMessagesWebhook: vi.fn(async () => true) }));
vi.mock('@/lib/meta-review/util', () => ({ isSafeReturnTo: () => false }));

const upserts: any[] = [];
const updates: any[] = [];
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      upsert: async (row: any) => { upserts.push(row); return { error: null }; },
      update: (v: any) => {
        updates.push(v);
        const chain: any = { eq: () => chain, neq: async () => ({ error: null }), then: (r: any) => r({ error: null }) };
        return chain;
      },
    }),
  }),
}));

function mockMeta() {
  (global.fetch as any) = vi.fn(async (url: string) => {
    if (String(url).includes('oauth/access_token')) {
      return { ok: true, text: async () => '{"access_token":"short","user_id":17841400000000001,"permissions":[]}' };
    }
    if (String(url).includes('/access_token?')) {
      return { ok: true, json: async () => ({ access_token: 'long', token_type: 'bearer', expires_in: 5184000 }) };
    }
    return { ok: true, json: async () => ({ id: '999', username: 'attacker_ig', name: 'A' }) };
  });
}

function callback(state: string) {
  const u = new URL('http://app.test/api/auth/instagram/callback');
  u.searchParams.set('code', 'the-code');
  u.searchParams.set('state', state);
  const { NextRequest } = require('next/server');
  return new NextRequest(u);
}

describe('Instagram OAuth callback only links an account named by a signed state', () => {
  beforeEach(() => {
    upserts.length = 0;
    updates.length = 0;
    mockMeta();
  });

  it('does not attach the connection to an accountId from forged, unsigned state', async () => {
    const { GET } = await import('@/app/api/auth/instagram/callback/route');
    await GET(callback(encodeURIComponent(JSON.stringify({ accountId: 'victim-account-id' }))));
    // the flow did reach the save step (so the check below is not vacuous)
    expect(upserts).toHaveLength(1);
    expect(updates.some((u) => u.account_id === 'victim-account-id')).toBe(false);
    expect(updates.some((u) => u.is_active === false)).toBe(false);
  });

  it('still links the connection for state minted by the connect route', async () => {
    const { signOAuthState } = await import('@/lib/instagram-graph/connect-token');
    const { GET } = await import('@/app/api/auth/instagram/callback/route');
    await GET(callback(signOAuthState({ accountId: 'real-account-id', returnTo: '' })));
    expect(upserts).toHaveLength(1);
    expect(updates).toContainEqual({ account_id: 'real-account-id' });
  });

  it('the connect route puts a signed state (for the token-verified account) on the Instagram URL', async () => {
    const { signConnectToken, verifyOAuthState } = await import('@/lib/instagram-graph/connect-token');
    const { GET } = await import('@/app/api/auth/instagram/connect/route');
    const { NextRequest } = await import('next/server');
    const res = await GET(new NextRequest(`http://app.test/api/auth/instagram/connect?token=${signConnectToken('acc-42')}`));
    const location = new URL(res.headers.get('location')!);
    expect(location.hostname).toBe('www.instagram.com');
    expect(verifyOAuthState(location.searchParams.get('state'))?.accountId).toBe('acc-42');
  });
});
