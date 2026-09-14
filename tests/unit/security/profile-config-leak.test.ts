/**
 * /api/influencer/profile?username= is unauthenticated (the public chat page
 * uses it) and returned `_rawConfig` = the whole accounts.config, minus only
 * `onboarding` and `shipping_webhook`. Verified live 2026-09-02: it leaked
 * widget.managementToken (= the /manage login), QuickShop api_key /
 * webhook_secret / webhook_token, whatsapp_cs.test_numbers and escalation
 * recipients.
 *
 * Anonymous callers now get an allow-list of what the public chat page reads.
 * The account's own session gets its config back (the widget editor seeds
 * from it) but never a credential.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authed = false;
vi.mock('@/lib/auth/influencer-auth', () => ({
  checkInfluencerAuth: vi.fn(async () => authed),
}));

const rawConfig = {
  username: 'argania_group',
  // --- things the public chat page reads ---
  support_categories: [{ id: 'order', label: 'הזמנה' }],
  support_redirect_to_tab: true,
  cs_web: { enabled: true, secret_prompt: 'internal policy text' },
  shipment_provider: { enabled: true, delivery_eta_business_days: 10, api_key: 'ship-key-123' },
  influencer_registry: [{ slug: 'dana', display_name: 'Dana', coupon_code: 'DANA10' }],
  chat: { banner: { headline: 'שלום' } },
  widget: {
    banner: { headline: 'hi', enabled: true },
    teaser: 'teaser',
    tooltip: 'tooltip',
    managementToken: 'mgmt-SECRET-token',
    domain: 'argania.co.il',
  },
  reels: [{ video: 'https://cdn/x.mp4' }],
  greeting_message: 'hello',
  // --- credentials / internal ---
  integrations: {
    quickshop: { api_key: 'qs-SECRET-key', webhook_secret: 'qs-SECRET-whsec', webhook_token: 'qs-SECRET-whtok' },
    shopify: { admin_api_token: 'shpat_SECRET', shop_domain: 'x.myshopify.com', enabled: true },
  },
  whatsapp_cs: { enabled: true, test_numbers: ['972500000000'] },
  escalation: { enabled: true, recipients: ['ops@example.com'] },
  onboarding: { token: 'onb-SECRET' },
  shipping_webhook: { hmac_secret: 'hmac-SECRET', token: 'shipwh-SECRET' },
};

vi.mock('@/lib/supabase', () => ({
  getInfluencerByUsername: vi.fn(async () => ({
    id: 'acc-1',
    username: 'argania_group',
    display_name: 'Argania',
    type: 'brand',
    is_active: true,
    security_config: { admin_password_hash: 'pbkdf2-SECRET-hash' },
    _rawConfig: JSON.parse(JSON.stringify(rawConfig)),
  })),
}));

function req() {
  return new Request('http://x/api/influencer/profile?username=argania_group') as any;
}

async function body() {
  const { GET } = await import('@/app/api/influencer/profile/route');
  const res = await GET(req());
  expect(res.status).toBe(200);
  return res.json();
}

const SECRET_MARKERS = ['SECRET', 'ship-key-123', '972500000000', 'ops@example.com', 'internal policy text'];

describe('GET /api/influencer/profile — config exposure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authed = false;
  });

  it('anonymous: leaks no credential, test number, recipient or internal setting', async () => {
    const json = await body();
    const text = JSON.stringify(json);
    for (const marker of SECRET_MARKERS) expect(text).not.toContain(marker);
    expect(json.influencer._rawConfig.integrations).toBeUndefined();
    expect(json.influencer._rawConfig.whatsapp_cs).toBeUndefined();
    expect(json.influencer._rawConfig.escalation).toBeUndefined();
    expect(json.influencer.security_config).toBeUndefined();
  });

  it('anonymous: still returns what the public chat page renders from', async () => {
    const json = await body();
    const c = json.influencer._rawConfig;
    expect(json.account.id).toBe('acc-1');
    expect(c.support_categories).toEqual(rawConfig.support_categories);
    expect(c.support_redirect_to_tab).toBe(true);
    expect(c.cs_web.enabled).toBe(true);
    expect(c.shipment_provider).toEqual({ enabled: true, delivery_eta_business_days: 10 });
    expect(c.influencer_registry).toEqual(rawConfig.influencer_registry);
    expect(c.chat.banner.headline).toBe('שלום');
    expect(c.widget.banner.headline).toBe('hi');
    expect(c.reels).toEqual(rawConfig.reels);
    expect(c.greeting_message).toBe('hello');
  });

  it("owner's session: gets the editable config back, still without any credential", async () => {
    authed = true;
    const json = await body();
    const c = json.influencer._rawConfig;
    const text = JSON.stringify(json);
    for (const marker of ['SECRET', 'ship-key-123']) expect(text).not.toContain(marker);
    expect(c.widget.banner.headline).toBe('hi');
    expect(c.widget.teaser).toBe('teaser');
    expect(c.widget.domain).toBe('argania.co.il');
    expect(c.integrations.shopify.shop_domain).toBe('x.myshopify.com');
    expect(c.escalation.enabled).toBe(true);
  });
});
