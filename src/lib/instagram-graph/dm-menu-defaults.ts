/**
 * Instagram DM entry points (ice breakers + persistent menu) — per archetype.
 *
 * WHY THIS EXISTS: the DM menu used to be ONE hardcoded e-commerce set applied to
 * every account — "יש לך קופון? 🎁", "מה המוצר הכי שווה?", "בעיה במוצר 🛍️".
 * LDRS GROUP is a B2B marketing agency (`archetype: service_provider`) with zero
 * coupons and zero products, and it ran that menu live from 2026-03-17. People
 * used it: on 2026-08-18 a stranger tapped "גלו מוצרים ⭐" and the bot answered
 * with LDRS's own CLIENT ROSTER framed as a shop — "ביוטי עם Clinique, Bobbi Brown
 * ו-Smashbox, אופנה עם H&M ו-Boohoo". "בעיה במוצר 🛍️" served the same 96 client
 * brands as a product-support brand picker.
 *
 * The same switch gates the rich cards in dm-handler, so the menu and the carousels
 * can never disagree about whether an account sells anything.
 */

export interface IceBreaker {
  question: string;
  payload: string;
}

export type MenuItem =
  | { type: 'postback'; title: string; payload: string }
  | { type: 'web_url'; title: string; url: string };

/**
 * Archetypes with no catalogue, no coupons and no orders. Everything else —
 * including an unknown or unset archetype — keeps the commerce surfaces, so a
 * new archetype can never silently lose a real shop. Opt OUT, never opt in.
 *
 * `b2b_saas` is here because it exists in `accounts.config.archetype` in
 * production (influencermarketing.ai) even though it is absent from the
 * AccountArchetype union in rag/archetypes.ts.
 */
const NON_COMMERCE_ARCHETYPES = new Set([
  'service_provider',
  'association',
  'government_ministry',
  'media_news',
  'saas_product',
  'b2b_saas',
]);

/** Does this account sell things? Drives both the DM menu and the rich cards. */
export function commerceSurfacesEnabled(archetype: string | null | undefined): boolean {
  return !NON_COMMERCE_ARCHETYPES.has((archetype || '').trim());
}

// ── Commerce set (the historical default — unchanged) ──

export const COMMERCE_ICE_BREAKERS: IceBreaker[] = [
  { question: 'יש לך קופון? 🎁', payload: 'icebreaker_coupon' },
  { question: 'מה המוצר הכי שווה?', payload: 'icebreaker_best_product' },
  { question: 'מה חדש? ✨', payload: 'icebreaker_whats_new' },
  { question: 'יש בעיה במוצר', payload: 'icebreaker_product_issue' },
];

export const COMMERCE_PERSISTENT_MENU: MenuItem[] = [
  { type: 'postback', title: 'גלו מוצרים ⭐', payload: 'menu_discover' },
  { type: 'postback', title: 'קופונים והנחות 🎁', payload: 'menu_coupons' },
  { type: 'postback', title: 'בעיה במוצר 🛍️', payload: 'menu_product_issue' },
];

// ── Non-commerce set ──
//
// The titles double as the message text Instagram delivers when a button is
// tapped, so each one has to be a question the bot can answer on its own — these
// carry no forced rich card by design. "נציג" is deliberate: it is an
// escalation trigger (engines/escalation/detect.ts), so a sender who needs a
// human gets one instead of the loop that ran on 2026-04-15.

const SERVICE_ICE_BREAKERS: IceBreaker[] = [
  { question: 'מה השירותים שלכם? 💡', payload: 'icebreaker_services' },
  { question: 'אשמח להצעת מחיר 💼', payload: 'icebreaker_quote' },
  { question: 'אני יוצר/ת תוכן ✨', payload: 'icebreaker_creator' },
  { question: 'אפשר לדבר עם נציג? 💬', payload: 'icebreaker_human' },
];

const SERVICE_PERSISTENT_MENU: MenuItem[] = [
  { type: 'postback', title: 'השירותים שלנו 💼', payload: 'menu_services' },
  { type: 'postback', title: 'אני יוצר/ת תוכן ✨', payload: 'menu_creator' },
  { type: 'postback', title: 'לדבר עם נציג 💬', payload: 'menu_human' },
];

export function defaultIceBreakers(archetype: string | null | undefined): IceBreaker[] {
  return commerceSurfacesEnabled(archetype) ? COMMERCE_ICE_BREAKERS : SERVICE_ICE_BREAKERS;
}

export function defaultPersistentMenu(archetype: string | null | undefined): MenuItem[] {
  return commerceSurfacesEnabled(archetype) ? COMMERCE_PERSISTENT_MENU : SERVICE_PERSISTENT_MENU;
}
