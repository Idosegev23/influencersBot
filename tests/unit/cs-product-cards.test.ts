import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sends are channel-scoped now; unit tests must not perform real channel resolution.
const getBestieChannel = vi.fn(async () => BESTIE_CHANNEL);
vi.mock('@/lib/whatsapp-cloud/channels', () => ({
  getBestieChannel: (...a: any[]) => getBestieChannel(...(a as [])),
  resolveChannelByAccount: vi.fn(async () => null),
  resolveChannelByPhoneNumberId: vi.fn(async () => null),
  invalidateChannelCache: vi.fn(async () => {}),
}));

// The shared Bestie number, and a brand running WhatsApp on its OWN number (BYO). The reply text
// is already sent on the channel the message arrived on; the cards must ride the same one.
const BESTIE_CHANNEL: any = {
  id: 'ch-bestie', accountId: 'acc-bestie', wabaId: 'waba-bestie',
  phoneNumberId: 'PNID_BESTIE', displayPhoneNumber: '+972 54-390-2030',
  verifiedName: 'Bestie', token: 'TOK_BESTIE', status: 'active', paymentReady: true,
};
const BRAND_CHANNEL: any = {
  id: 'ch-brand', accountId: 'acc-argania', wabaId: 'waba-brand',
  phoneNumberId: 'PNID_BRAND', displayPhoneNumber: '+972 3-000-0000',
  verifiedName: 'ARGANIA', token: 'TOK_BRAND', status: 'active', paymentReady: true,
};


const sendInteractiveCtaUrl = vi.fn();
const sendText = vi.fn();
vi.mock('@/lib/whatsapp-cloud/client', () => ({
  sendInteractiveCtaUrl: (...a: any[]) => sendInteractiveCtaUrl(...a),
  sendText: (...a: any[]) => sendText(...a),
}));

const card = (over: any = {}) => ({
  productId: '11111111-1111-1111-1111-111111111111',
  name: 'מרכך קיק 450 מל',
  price: 45.9,
  originalPrice: null,
  isOnSale: false,
  productUrl: 'https://argania-oil.co.il/product/castor-conditioner',
  imageUrl: 'https://cdn.example.com/a.webp',
  ...over,
});

describe('CS product cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendInteractiveCtaUrl.mockResolvedValue({ success: true });
    sendText.mockResolvedValue({ success: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://bestie.example.com';
  });

  describe('formatCardBody', () => {
    it('name then price', async () => {
      const { formatCardBody } = await import('@/lib/cs/cs-product-cards');
      expect(formatCardBody(card())).toBe('מרכך קיק 450 מל\n₪45.90');
    });

    it('a whole-shekel price loses the decimals', async () => {
      const { formatCardBody } = await import('@/lib/cs/cs-product-cards');
      expect(formatCardBody(card({ price: 45 }))).toBe('מרכך קיק 450 מל\n₪45');
    });

    it('a null price drops the line entirely — never "₪null"', async () => {
      const { formatCardBody } = await import('@/lib/cs/cs-product-cards');
      const body = formatCardBody(card({ price: null }));
      expect(body).toBe('מרכך קיק 450 מל');
      expect(body).not.toContain('null');
      expect(body).not.toContain('₪');
    });

    it('a sale shows both prices', async () => {
      const { formatCardBody } = await import('@/lib/cs/cs-product-cards');
      expect(formatCardBody(card({ price: 50.9, originalPrice: 69.9, isOnSale: true })))
        .toBe('מרכך קיק 450 מל\n₪50.90 במקום ₪69.90');
    });

    it('an "original" price that is not actually higher is ignored', async () => {
      const { formatCardBody } = await import('@/lib/cs/cs-product-cards');
      expect(formatCardBody(card({ price: 50.9, originalPrice: 50.9, isOnSale: true })))
        .toBe('מרכך קיק 450 מל\n₪50.90');
    });
  });

  describe('productImageUrl', () => {
    it('points at our JPEG view, not the stored webp — WhatsApp rejects webp', async () => {
      const { productImageUrl } = await import('@/lib/cs/cs-product-cards');
      const url = productImageUrl('11111111-1111-1111-1111-111111111111');
      expect(url).toBe('https://bestie.example.com/api/wa/product-image/11111111-1111-1111-1111-111111111111');
      expect(url).not.toContain('.webp');
    });
  });

  describe('sendProductCards', () => {
    it('sends one cta_url per card, in order, with the deep link on the button', async () => {
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [
        card(),
        card({ productId: '22222222-2222-2222-2222-222222222222', name: 'שמן ארגן' }),
      ] });
      expect(sent).toBe(2);
      expect(sendInteractiveCtaUrl).toHaveBeenCalledTimes(2);
      expect(sendInteractiveCtaUrl.mock.calls[0][0]).toMatchObject({
        to: '972501112222',
        url: 'https://argania-oil.co.il/product/castor-conditioner',
        displayText: 'לצפייה במוצר',
        imageUrl: 'https://bestie.example.com/api/wa/product-image/11111111-1111-1111-1111-111111111111',
      });
      expect(sendInteractiveCtaUrl.mock.calls[1][0].body).toContain('שמן ארגן');
      expect(sendText).not.toHaveBeenCalled();
    });

    it('button label stays inside WhatsApp’s 20-character cap', async () => {
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
      expect(sendInteractiveCtaUrl.mock.calls[0][0].displayText.length).toBeLessThanOrEqual(20);
    });

    it('a rejected card falls back to text that still carries the link', async () => {
      sendInteractiveCtaUrl.mockResolvedValue({ success: false });
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
      expect(sent).toBe(1);
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText.mock.calls[0][0].body).toContain('https://argania-oil.co.il/product/castor-conditioner');
    });

    it('a throwing send also falls back rather than losing the product', async () => {
      sendInteractiveCtaUrl.mockRejectedValue(new Error('graph 400: bad image'));
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
      expect(sent).toBe(1);
      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it('one undeliverable card does not stop the others', async () => {
      sendInteractiveCtaUrl
        .mockResolvedValueOnce({ success: false })
        .mockResolvedValueOnce({ success: true });
      sendText.mockResolvedValue({ success: false });
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [
        card(),
        card({ productId: '22222222-2222-2222-2222-222222222222', name: 'שמן ארגן' }),
      ] });
      expect(sent).toBe(1);
      expect(sendInteractiveCtaUrl).toHaveBeenCalledTimes(2);
    });

    // --- the bug this signature exists to prevent -------------------------------------------
    // cs-product-cards used to resolve getBestieChannel() itself, while the worker sent the reply
    // text on the channel the message ARRIVED on. For a brand on its own WhatsApp number that put
    // the prose and the cards on two different numbers — i.e. two different chat threads.
    it('sends the cards on the channel it was given, not the shared Bestie number', async () => {
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BRAND_CHANNEL, to: '972501112222', cards: [card()] });
      expect(sent).toBe(1);
      expect(sendInteractiveCtaUrl).toHaveBeenCalledTimes(1);
      expect(sendInteractiveCtaUrl.mock.calls[0][0].channel).toBe(BRAND_CHANNEL);
      expect(sendInteractiveCtaUrl.mock.calls[0][0].channel.phoneNumberId).toBe('PNID_BRAND');
      expect(getBestieChannel).not.toHaveBeenCalled();
    });

    it('the text fallback rides the same channel as the card it replaces', async () => {
      sendInteractiveCtaUrl.mockResolvedValue({ success: false });
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      const sent = await sendProductCards({ channel: BRAND_CHANNEL, to: '972501112222', cards: [card()] });
      expect(sent).toBe(1);
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(sendText.mock.calls[0][0].channel).toBe(BRAND_CHANNEL);
      expect(getBestieChannel).not.toHaveBeenCalled();
    });

    it('no cards → no sends', async () => {
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      expect(await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [] })).toBe(0);
      expect(sendInteractiveCtaUrl).not.toHaveBeenCalled();
    });
  });
});
