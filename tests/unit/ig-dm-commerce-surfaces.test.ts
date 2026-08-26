import { describe, it, expect } from 'vitest';
import {
  commerceSurfacesEnabled,
  defaultIceBreakers,
  defaultPersistentMenu,
  COMMERCE_ICE_BREAKERS,
  COMMERCE_PERSISTENT_MENU,
} from '@/lib/instagram-graph/dm-menu-defaults';
import { resolveCardAction } from '@/lib/instagram-graph/dm-rich-cards';

/**
 * Regression: LDRS GROUP (archetype `service_provider`) ran the hardcoded
 * e-commerce DM menu from 2026-03-17 to 2026-08-26. Strangers opened the agency's
 * DM and were offered "יש לך קופון? 🎁" / "מה המוצר הכי שווה?" / "בעיה במוצר 🛍️",
 * and tapping them made the bot serve LDRS's own CLIENT ROSTER as a shop catalogue
 * ("ביוטי עם Clinique, Bobbi Brown ו-Smashbox, אופנה עם H&M ו-Boohoo…", 2026-08-18).
 */
describe('commerceSurfacesEnabled', () => {
  it('turns commerce off for the archetypes that have no shop', () => {
    for (const archetype of [
      'service_provider',
      'association',
      'government_ministry',
      'media_news',
      'saas_product',
      'b2b_saas',
    ]) {
      expect(commerceSurfacesEnabled(archetype)).toBe(false);
    }
  });

  it('leaves every selling archetype exactly as it was', () => {
    for (const archetype of ['brand', 'influencer', 'local_business', 'tech_creator']) {
      expect(commerceSurfacesEnabled(archetype)).toBe(true);
    }
  });

  it('defaults to commerce for an unknown or unset archetype — never silently strips a shop', () => {
    expect(commerceSurfacesEnabled(undefined)).toBe(true);
    expect(commerceSurfacesEnabled(null)).toBe(true);
    expect(commerceSurfacesEnabled('')).toBe(true);
    expect(commerceSurfacesEnabled('something_new_we_added_later')).toBe(true);
  });
});

describe('defaultIceBreakers / defaultPersistentMenu', () => {
  it('gives a service provider entry points about services, not coupons', () => {
    const ice = defaultIceBreakers('service_provider');
    const menu = defaultPersistentMenu('service_provider');
    const iceText = ice.map((b) => b.question).join(' | ');
    const menuText = menu.map((m: any) => m.title).join(' | ');

    // Presence: the B2B entry points a marketing agency actually needs.
    expect(iceText).toContain('שירותים');
    expect(iceText).toContain('הצעת מחיר');
    expect(iceText).toContain('יוצר/ת תוכן');
    expect(menuText).toContain('נציג'); // routes an angry / stuck sender to a human

    // Absence: the commerce vocabulary that was wrong for LDRS is gone.
    for (const text of [iceText, menuText]) {
      expect(text).not.toContain('קופון');
      expect(text).not.toContain('מוצר');
      expect(text).not.toContain('הנחות');
    }
  });

  it('keeps the shop entry points for a brand — the existing set, untouched', () => {
    expect(defaultIceBreakers('brand')).toEqual(COMMERCE_ICE_BREAKERS);
    expect(defaultPersistentMenu('brand')).toEqual(COMMERCE_PERSISTENT_MENU);
    expect(defaultIceBreakers(undefined)).toEqual(COMMERCE_ICE_BREAKERS);
    expect(defaultPersistentMenu(undefined)).toEqual(COMMERCE_PERSISTENT_MENU);
  });

  it('stays inside the limits Meta enforces on both surfaces', () => {
    for (const archetype of ['brand', 'service_provider', 'government_ministry', undefined]) {
      const ice = defaultIceBreakers(archetype);
      const menu = defaultPersistentMenu(archetype);
      expect(ice.length).toBeGreaterThan(0);
      expect(ice.length).toBeLessThanOrEqual(4); // Meta: max 4 ice breakers
      expect(menu.length).toBeGreaterThan(0);
      expect(menu.length).toBeLessThanOrEqual(5); // Meta: max 5 persistent-menu items
      for (const b of ice) expect(b.question.length).toBeLessThanOrEqual(80);
      for (const m of menu as any[]) expect(m.title.length).toBeLessThanOrEqual(30);
    }
  });

  it('gives every entry point a payload, so no button is inert', () => {
    for (const archetype of ['brand', 'service_provider', 'association', undefined]) {
      for (const b of defaultIceBreakers(archetype)) expect(b.payload).toBeTruthy();
      for (const m of defaultPersistentMenu(archetype) as any[]) {
        expect(m.type).toBe('postback');
        expect(m.payload).toBeTruthy();
      }
    }
  });
});


/**
 * Second half of the same bug. `sendRichCardsIfRelevant` fired on Hebrew
 * keywords with no account-archetype check at all, so on LDRS an ordinary B2B
 * sentence containing "מוצר" / "ממליץ" / "שווה" triggered a product carousel, and
 * "בעיה" triggered a brand picker built from `partnerships` — i.e. the agency's 96
 * CLIENT BRANDS served to a stranger as a product-support menu.
 */
describe('resolveCardAction', () => {
  const brand = (over: Partial<Parameters<typeof resolveCardAction>[0]> = {}) =>
    resolveCardAction({ accountArchetype: 'brand', botArchetype: 'general', messageText: '', ...over });
  const agency = (over: Partial<Parameters<typeof resolveCardAction>[0]> = {}) =>
    resolveCardAction({ accountArchetype: 'service_provider', botArchetype: 'general', messageText: '', ...over });

  it('a shop still gets every card it got before', () => {
    // Presence — without these the "agency gets nothing" assertions below are vacuous.
    expect(brand({ postbackPayload: 'menu_coupons' })).toBe('coupons');
    expect(brand({ postbackPayload: 'menu_discover' })).toBe('discover');
    expect(brand({ postbackPayload: 'icebreaker_product_issue' })).toBe('brand_select');
    expect(brand({ postbackPayload: 'brand_issue_SodaStream' })).toBe('issue');
    expect(brand({ messageText: 'יש לי בעיה עם המוצר' })).toBe('brand_select');
    expect(brand({ messageText: 'מה הכי שווה לקנות?' })).toBe('discover');
    expect(brand({ botArchetype: 'coupons', messageText: 'היי' })).toBe('coupons');
  });

  it('an agency gets none of them — not by postback, not by keyword', () => {
    expect(agency({ postbackPayload: 'menu_coupons' })).toBeNull();
    expect(agency({ postbackPayload: 'menu_discover' })).toBeNull();
    expect(agency({ postbackPayload: 'icebreaker_product_issue' })).toBeNull();
    expect(agency({ postbackPayload: 'brand_issue_SodaStream' })).toBeNull();
    expect(agency({ botArchetype: 'coupons', messageText: 'היי' })).toBeNull();
  });

  it('the exact LDRS sentences that misfired now produce nothing', () => {
    // Real user messages from the ldrs_group DM log.
    expect(agency({ messageText: 'מה המוצר הכי שווה?' })).toBeNull();
    expect(agency({ messageText: 'בעיה במוצר 🛍️' })).toBeNull();
    expect(agency({ messageText: 'אני ממליץ לבדוק את זה' })).toBeNull();
    expect(agency({ messageText: 'יש בעיה בתשלום שלא עבר לי' })).toBeNull();
    // …while the same words on a shop still work.
    expect(brand({ messageText: 'מה המוצר הכי שווה?' })).toBe('discover');
  });

  it('returns null for an ordinary message on either kind of account', () => {
    expect(brand({ messageText: 'היי מה קורה?' })).toBeNull();
    expect(agency({ messageText: 'היי מה קורה?' })).toBeNull();
  });

  it('a new account with no archetype keeps the old behaviour', () => {
    expect(resolveCardAction({ accountArchetype: undefined, botArchetype: 'general', messageText: 'מה המוצר הכי שווה?' }))
      .toBe('discover');
  });
});
