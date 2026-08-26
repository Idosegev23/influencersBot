/**
 * Which rich card (if any) a DM turn should produce.
 *
 * Split out of dm-handler so the decision is testable on its own, and so the
 * account-archetype gate can never be skipped: the old code ran the keyword
 * scan on every account. On LDRS GROUP — a B2B agency with no catalogue — an
 * ordinary sentence containing "מוצר", "ממליץ" or "שווה" sent a product
 * carousel, and anything containing "בעיה" sent a brand picker assembled from
 * `partnerships`, which on that account is the agency's own 96 CLIENT BRANDS.
 * A stranger in the DM was shown SodaStream / Bepanthen / Burger King /
 * משרד התיירות as a product-support menu.
 */
import { commerceSurfacesEnabled } from './dm-menu-defaults';

export type CardAction = 'discover' | 'coupons' | 'issue' | 'brand_select';

/** Keywords that indicate a product issue */
export const ISSUE_KEYWORDS = ['בעיה', 'לא עובד', 'שבור', 'החלפה', 'החזרה', 'תקלה', 'פגום', 'לא מרוצ', 'נהרס'];

/** Keywords that indicate product discovery */
export const PRODUCT_KEYWORDS = ['מוצר', 'ממליצ', 'שווה', 'לקנות', 'אהבת', 'גלו', 'המלצ', 'הכי טוב', 'מומלץ'];

/** Postback payloads from persistent menu & ice breakers that force specific rich cards */
export const MENU_POSTBACK_MAP: Record<string, CardAction> = {
  menu_discover: 'discover',
  menu_coupons: 'coupons',
  menu_products: 'discover',
  menu_product_issue: 'brand_select', // Show brand selection first (like social chat)
  menu_chat: 'discover',
  icebreaker_coupon: 'coupons',
  icebreaker_best_product: 'discover',
  icebreaker_whats_new: 'discover',
  icebreaker_product_issue: 'brand_select', // Show brand selection first
  product_issue_return: 'issue',
  product_issue_quality: 'issue',
};

export function resolveCardAction(input: {
  /** `accounts.config.archetype` — what kind of business this is. */
  accountArchetype: string | null | undefined;
  /** The SandwichBot's per-turn archetype (e.g. 'coupons', 'general'). */
  botArchetype: string;
  messageText: string;
  postbackPayload?: string;
}): CardAction | null {
  // One gate, before anything else: an account with no shop never gets a
  // commerce card, whatever the sender typed or tapped.
  if (!commerceSurfacesEnabled(input.accountArchetype)) return null;

  const { botArchetype, messageText, postbackPayload } = input;

  // --- Menu / Ice Breaker postback: force specific rich cards ---
  if (postbackPayload?.startsWith('brand_issue_')) return 'issue';
  if (postbackPayload && MENU_POSTBACK_MAP[postbackPayload]) return MENU_POSTBACK_MAP[postbackPayload];

  // --- Keyword-based detection (organic messages, not postbacks) ---
  const lowerMessage = (messageText || '').toLowerCase();

  if (ISSUE_KEYWORDS.some((kw) => lowerMessage.includes(kw))) return 'brand_select';
  if (botArchetype === 'coupons') return 'coupons';
  if (PRODUCT_KEYWORDS.some((kw) => lowerMessage.includes(kw))) return 'discover';

  return null;
}
