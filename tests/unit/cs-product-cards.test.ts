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

const imageFetch = vi.fn();

describe('CS product cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendInteractiveCtaUrl.mockResolvedValue({ success: true });
    sendText.mockResolvedValue({ success: true });
    process.env.NEXT_PUBLIC_APP_URL = 'https://bestie.example.com';
    // The card image is preflighted (see sendProductCards). Default: our route serves a JPEG.
    imageFetch.mockReset().mockImplementation(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', imageFetch);
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

    // --- the image header fails AFTER Meta says "sent" -----------------------------------------
    // Meta accepts a cta_url with a header image link synchronously (200 + message id) and only
    // fetches the image at delivery; a failed fetch arrives later as a `failed` status webhook —
    // and CS sends are never written to whatsapp_messages, so that status matched no row and
    // nobody ever saw it. The sync fallback above could not fire for the production bug (every
    // image URL 500'd). So the image is checked BEFORE the card is sent.
    describe('image preflight', () => {
      it('fetches our JPEG view before sending, and keeps the card when it is servable', async () => {
        const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
        const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
        expect(sent).toBe(1);
        expect(imageFetch).toHaveBeenCalledTimes(1);
        expect(String(imageFetch.mock.calls[0][0])).toBe('https://bestie.example.com/api/wa/product-image/11111111-1111-1111-1111-111111111111');
        expect(sendInteractiveCtaUrl).toHaveBeenCalledTimes(1);
        expect(sendText).not.toHaveBeenCalled();
      });

      it('an image route that errors (the production 500) sends text with the link instead of a card', async () => {
        imageFetch.mockImplementation(async () => new Response('<html>500</html>', { status: 500, headers: { 'content-type': 'text/html' } }));
        const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
        const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
        expect(sent).toBe(1);
        expect(sendInteractiveCtaUrl).not.toHaveBeenCalled();
        expect(sendText).toHaveBeenCalledTimes(1);
        expect(sendText.mock.calls[0][0].body).toContain('מרכך קיק 450 מל');
        expect(sendText.mock.calls[0][0].body).toContain('https://argania-oil.co.il/product/castor-conditioner');
      });

      it('a 200 that is not a JPEG/PNG (e.g. a JSON error or a webp) also falls back to text', async () => {
        imageFetch.mockImplementation(async () => new Response('{"error":"x"}', { status: 200, headers: { 'content-type': 'application/json' } }));
        const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
        await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
        expect(sendInteractiveCtaUrl).not.toHaveBeenCalled();
        expect(sendText).toHaveBeenCalledTimes(1);
      });

      it('a preflight that throws (timeout) falls back to text rather than losing the product', async () => {
        imageFetch.mockRejectedValue(new Error('The operation was aborted due to timeout'));
        const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
        const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [card()] });
        expect(sent).toBe(1);
        expect(sendInteractiveCtaUrl).not.toHaveBeenCalled();
        expect(sendText.mock.calls[0][0].body).toContain('https://argania-oil.co.il/product/castor-conditioner');
      });

      it('only the card whose image fails degrades; the others stay cards, in order', async () => {
        imageFetch
          .mockImplementationOnce(async () => new Response('x', { status: 500 }))
          .mockImplementationOnce(async () => new Response(new Uint8Array([0xff, 0xd8]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
        const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
        const sent = await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [
          card(),
          card({ productId: '22222222-2222-2222-2222-222222222222', name: 'שמן ארגן' }),
        ] });
        expect(sent).toBe(2);
        expect(sendText).toHaveBeenCalledTimes(1);
        expect(sendText.mock.calls[0][0].body).toContain('מרכך קיק 450 מל');
        expect(sendInteractiveCtaUrl).toHaveBeenCalledTimes(1);
        expect(sendInteractiveCtaUrl.mock.calls[0][0].body).toContain('שמן ארגן');
      });
    });

    it('no cards → no sends', async () => {
      const { sendProductCards } = await import('@/lib/cs/cs-product-cards');
      expect(await sendProductCards({ channel: BESTIE_CHANNEL, to: '972501112222', cards: [] })).toBe(0);
      expect(sendInteractiveCtaUrl).not.toHaveBeenCalled();
    });
  });
});
