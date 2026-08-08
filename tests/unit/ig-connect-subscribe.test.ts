import { describe, it, expect, vi, afterEach } from 'vitest';
import { subscribeMessagesWebhook, getSubscribedFields } from '@/lib/instagram-graph/subscribe';
import { IG_OAUTH_SCOPES, IG_OAUTH_SCOPE_PARAM } from '@/lib/instagram-graph/scopes';

afterEach(() => vi.restoreAllMocks());

describe('IG_OAUTH_SCOPES', () => {
  // App Review 2026-08-08 rejected insights + comments. Requesting a
  // Standard-Access permission in the authorize URL can fail the consent screen
  // for users without a role in the Meta app — i.e. every real customer.
  it('requests only permissions with Advanced Access', () => {
    expect([...IG_OAUTH_SCOPES]).toEqual([
      'instagram_business_basic',
      'instagram_business_manage_messages',
    ]);
  });

  it('does not request the rejected permissions', () => {
    expect(IG_OAUTH_SCOPE_PARAM).not.toContain('manage_insights');
    expect(IG_OAUTH_SCOPE_PARAM).not.toContain('manage_comments');
  });
});

describe('subscribeMessagesWebhook', () => {
  it('POSTs subscribed_fields=messages and reports success', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(subscribeMessagesWebhook('TOKEN123')).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(url).toContain('/me/subscribed_apps');
    expect(url).toContain('subscribed_fields=messages');
    expect(url).toContain('access_token=TOKEN123');
  });

  it('returns false when Graph responds with success:false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(subscribeMessagesWebhook('T')).resolves.toBe(false);
  });

  it('returns false on an HTTP error instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 400 })));
    await expect(subscribeMessagesWebhook('T')).resolves.toBe(false);
  });

  it('returns false when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(subscribeMessagesWebhook('T')).resolves.toBe(false);
  });
});

describe('getSubscribedFields', () => {
  it('flattens subscribed_fields across apps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ subscribed_fields: ['messages', 'comments'] }, { subscribed_fields: ['messages'] }],
    }), { status: 200 })));

    const fields = await getSubscribedFields('T');
    expect(fields).toBeInstanceOf(Set);
    expect([...fields!].sort()).toEqual(['comments', 'messages']);
  });

  // null means "lookup failed", which must stay distinguishable from an empty
  // set ("definitely not subscribed") — the cron only re-subscribes on the latter.
  it('returns null when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(getSubscribedFields('T')).resolves.toBeNull();
  });
});
