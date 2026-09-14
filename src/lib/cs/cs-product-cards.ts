/**
 * Turning the brain's chosen products into WhatsApp messages.
 *
 * The widget can render N product cards inside one reply; WhatsApp cannot — there is no
 * multi-card message without a Meta Commerce catalog connected to the WABA, and Bestie CS runs
 * one shared number across many brands. So each card is its own `cta_url` message: image header,
 * name + price, and a button straight to the product page.
 */
import { sendInteractiveCtaUrl, sendText } from '@/lib/whatsapp-cloud/client';
import type { WaChannel } from '@/lib/whatsapp-cloud/channels';
import type { CsProductCard } from '@/lib/cs/tools/types';

const BUTTON_LABEL = 'לצפייה במוצר';   // 12 chars — WhatsApp caps display_text at 20

// Base URL chain: NEXT_PUBLIC_APP_URL → VERCEL_URL → bestieai.co.il, matching the rest of the
// app, so cards work in prod, preview and local without env juggling.
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    || 'https://bestieai.co.il').replace(/\/$/, '');
}

// WhatsApp rejects the stored .webp, so the header image points at our JPEG view of it.
export function productImageUrl(productId: string): string {
  return `${appBaseUrl()}/api/wa/product-image/${productId}`;
}

function formatPrice(n: number): string {
  return `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/**
 * Card body: name, then a price line. A product with no price simply has no price line — 18 of
 * Argania's 128 products have a null price, and "₪null" would be worse than saying nothing.
 */
export function formatCardBody(card: CsProductCard): string {
  const lines = [card.name.trim()];
  if (typeof card.price === 'number') {
    const onSale = card.isOnSale && typeof card.originalPrice === 'number' && card.originalPrice > card.price;
    lines.push(onSale
      ? `${formatPrice(card.price)} במקום ${formatPrice(card.originalPrice!)}`
      : formatPrice(card.price));
  }
  return lines.join('\n').slice(0, 1024);
}

// Generous: a cold function plus a first-time transcode. Meta's own fetch will hit the CDN copy
// this request leaves behind (the route's success response is `immutable`).
const IMAGE_PREFLIGHT_TIMEOUT_MS = 9000;

/**
 * Can Meta actually fetch this card's header image? Asked BEFORE the card is sent, because Meta
 * will not tell us synchronously: a cta_url with an image link is accepted (200 + message id) and
 * the image is fetched only at delivery — a failure arrives later as a `failed` status webhook.
 * CS sends are never written to whatsapp_messages, so that status matches no row and nobody sees
 * it. This is how every card image 500'd in production without a single fallback firing.
 */
async function imageIsServable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_PREFLIGHT_TIMEOUT_MS) });
    const type = res.headers.get('content-type') || '';
    try { await res.arrayBuffer(); } catch { /* body drained only to free the socket */ }
    if (res.ok && /^image\/(jpeg|png)\b/i.test(type)) return true;
    console.warn('[cs-cards] image preflight rejected', url, res.status, type);
    return false;
  } catch (e: any) {
    console.warn('[cs-cards] image preflight threw', url, e?.message);
    return false;
  }
}

/**
 * Send one card. Falls back to a plain text message carrying the same link if the image can't be
 * served (checked up front, see imageIsServable) or the interactive send fails for any reason —
 * the shopper was just told about this product, so they must end up with a way to reach it.
 *
 * The channel is passed in, never resolved here: the reply text is already sent on the channel
 * the message ARRIVED on, and a brand running WhatsApp on its own number would otherwise get its
 * prose from one number and its cards from the shared Bestie number — two separate chat threads.
 */
async function sendOneCard(channel: WaChannel, to: string, card: CsProductCard, imageOk: boolean): Promise<boolean> {
  const body = formatCardBody(card);
  if (imageOk) {
    try {
      const res = await sendInteractiveCtaUrl({
        channel,
        to,
        body,
        displayText: BUTTON_LABEL,
        url: card.productUrl,
        imageUrl: productImageUrl(card.productId),
      });
      if (res.success) return true;
    } catch (e) {
      console.warn('[cs-cards] cta_url send threw', card.productId, e);
    }
  }
  try {
    const res = await sendText({ channel, to, body: `${body}\n${card.productUrl}` });
    if (!res.success) console.warn('[cs-cards] text fallback failed', card.productId);
    return res.success;
  } catch (e) {
    console.warn('[cs-cards] text fallback threw', card.productId, e);
    return false;
  }
}

/**
 * Send every card in order, after the turn's prose. Sequential on purpose: WhatsApp shows
 * messages in arrival order, and a parallel burst would scramble the ranking the brain chose.
 * A card that can't be delivered is logged and skipped — it never fails the turn, because the
 * shopper has already received the actual answer.
 */
export async function sendProductCards(
  params: { channel: WaChannel; to: string; cards: CsProductCard[] },
): Promise<number> {
  const { channel, to, cards } = params;
  // Preflights run together (up to 3 cold transcodes would otherwise stack up); sends stay in order.
  const imageOk = await Promise.all(cards.map((c) => imageIsServable(productImageUrl(c.productId))));
  let sent = 0;
  for (let i = 0; i < cards.length; i++) {
    if (await sendOneCard(channel, to, cards[i], imageOk[i])) sent++;
  }
  return sent;
}
