/**
 * Turning the brain's chosen products into WhatsApp messages.
 *
 * The widget can render N product cards inside one reply; WhatsApp cannot — there is no
 * multi-card message without a Meta Commerce catalog connected to the WABA, and Bestie CS runs
 * one shared number across many brands. So each card is its own `cta_url` message: image header,
 * name + price, and a button straight to the product page.
 */
import { sendInteractiveCtaUrl, sendText } from '@/lib/whatsapp-cloud/client';
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

/**
 * Send one card. Falls back to a plain text message carrying the same link if the interactive
 * send fails for any reason (a rejected image, a transcode timeout, a Meta hiccup) — the shopper
 * was just told about this product, so they must end up with a way to reach it.
 */
async function sendOneCard(to: string, card: CsProductCard): Promise<boolean> {
  const body = formatCardBody(card);
  try {
    const res = await sendInteractiveCtaUrl({
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
  try {
    const res = await sendText({ to, body: `${body}\n${card.productUrl}` });
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
export async function sendProductCards(to: string, cards: CsProductCard[]): Promise<number> {
  let sent = 0;
  for (const card of cards) {
    if (await sendOneCard(to, card)) sent++;
  }
  return sent;
}
