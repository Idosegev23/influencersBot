import { describe, it, expect } from 'vitest';
import { sanitizeOverrides, resolveBanner } from '@/lib/widget/banner';
import { buildBannerDraft, type BannerDraftFields } from '@/lib/widget/banner-draft';

describe('sanitizeOverrides', () => {
  it('drops non-arrays', () => {
    expect(sanitizeOverrides(null)).toEqual([]);
    expect(sanitizeOverrides({})).toEqual([]);
  });

  it('keeps a well-formed override', () => {
    const out = sanitizeOverrides([
      { id: 'sale', from: '2026-08-20', until: '2026-08-31', surface: 'both', headline: 'מבצע' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].headline).toBe('מבצע');
  });

  it('rejects malformed dates rather than storing a window that never closes', () => {
    const out = sanitizeOverrides([{ from: '20/08/2026', headline: 'x' }]);
    expect(out[0].from).toBeUndefined();
  });

  it('rejects a window that ends before it starts', () => {
    expect(sanitizeOverrides([{ from: '2026-08-31', until: '2026-08-01', headline: 'x' }])).toEqual([]);
  });

  it('normalises an unknown surface to both', () => {
    expect(sanitizeOverrides([{ surface: 'sms', headline: 'x' }])[0].surface).toBe('both');
  });

  it('caps the list so config cannot balloon', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ headline: `x${i}` }));
    expect(sanitizeOverrides(many)).toHaveLength(20);
  });

  it('drops an override with no content — a window over nothing is not a promotion', () => {
    expect(sanitizeOverrides([{ from: '2026-08-01', until: '2026-08-31' }])).toEqual([]);
  });

  it('rejects a date that is shaped right but is not a real date', () => {
    expect(sanitizeOverrides([{ until: '2026-13-45', headline: 'x' }])[0].until).toBeUndefined();
    expect(sanitizeOverrides([{ until: '9999-99-99', headline: 'x' }])[0].until).toBeUndefined();
  });

  it('rejects a day that does not exist in that month', () => {
    // Date would silently roll this forward to March 2nd.
    expect(sanitizeOverrides([{ until: '2026-02-30', headline: 'x' }])[0].until).toBeUndefined();
  });

  it('keeps a leap day that does exist', () => {
    expect(sanitizeOverrides([{ until: '2028-02-29', headline: 'x' }])[0].until).toBe('2028-02-29');
  });
});

/**
 * `buildBannerDraft` — the widget editor's save-time `widget.banner`
 * construction, extracted from page.tsx so its `enabled`-key predicate has a
 * direct test surface. A prior review found that deleting the line that used
 * to protect the reel-driven case (page.tsx:477, `enabled: currentBanner
 * ?.enabled !== false`) left all 113 tests green — nothing exercised it.
 * These tests pin the four account shapes the fix has to get right, plus the
 * "untouched keys survive a save" contract every prior round already relied
 * on (invariant 1 in the review brief).
 */
describe('buildBannerDraft', () => {
  const blankFields: BannerDraftFields = {
    eyebrow: '',
    headline: '',
    subline: '',
    ctaLabel: '',
    ctaValue: '',
    startersLabel: '',
    starterItems: [],
  };

  it('reel-driven auto-banner: forces enabled:true so the video banner keeps resolving after an unrelated save', () => {
    // No stored banner at all — this account has only ever rendered a banner
    // via resolveBanner's "hasReels + no widget.banner" fallback.
    const draft = buildBannerDraft(null, /* bannerEnabled seeded */ true, /* hasReels */ true, blankFields);
    expect(draft.enabled).toBe(true);

    // Behavioural check, not just the flag: without `enabled: true` here,
    // resolveBanner would return null for this account the moment the page
    // writes ANY object into widget.banner, since raw content is blank.
    const config = { widget: { banner: draft }, reels: [{ video: 'https://cdn.example.com/a.mp4', poster: null }] };
    const resolved = resolveBanner(config, 'widget', { brandName: 'מותג לדוגמה' });
    expect(resolved).not.toBeNull();
    expect(resolved?.art.mode).toBe('video');
  });

  it('hand-crafted banner: preserves stored enabled:true and carries every untouched key through unchanged', () => {
    const currentBanner = {
      enabled: true,
      headline: 'מבצע קיץ',
      valueLine: 'משלוח חינם מעל 200 ש״ח',
      art: { mode: 'image', image: 'https://cdn.example.com/cover.jpg' },
      cta: { action: 'url' as const, label: 'לחנות', value: 'https://example.com/shop' },
    };
    // The customer's inputs were seeded from the stored values (invariant 2
    // in the review brief) and left untouched except subline — that's the
    // realistic "opened the page, tweaked one field, saved" flow.
    const fields: BannerDraftFields = {
      ...blankFields,
      headline: 'מבצע קיץ',
      subline: 'עד גמר המלאי',
      ctaLabel: 'לחנות',
      ctaValue: 'https://example.com/shop',
    };
    const draft = buildBannerDraft(currentBanner, true, false, fields);

    expect(draft.enabled).toBe(true);
    // Fields this page doesn't expose must survive the wholesale replace
    // /api/influencer/settings does on widget.banner.
    expect(draft.valueLine).toBe('משלוח חינם מעל 200 ש״ח');
    expect(draft.art).toEqual({ mode: 'image', image: 'https://cdn.example.com/cover.jpg' });
    // cta's untouched `action` key survives even though label/value are
    // whole-object-replaced by the (unchanged) form inputs.
    const cta = draft.cta as { action?: string; label?: string };
    expect(cta.action).toBe('url');
    expect(cta.label).toBe('לחנות');
  });

  it('enabled:false: explicit off wins even when the account also has reels', () => {
    const currentBanner = { enabled: false, headline: 'ישן' };
    // bannerEnabled is seeded false for this account (enabled !== false is
    // false) and left untouched by the customer.
    const draft = buildBannerDraft(currentBanner, false, /* hasReels */ true, blankFields);
    expect(draft.enabled).toBe(false);
  });

  it('neither reels nor banner: writing only unrelated fields (e.g. a teaser bubble) must not manufacture a banner', () => {
    // No stored banner, no reels, no banner content typed — bannerEnabled
    // seeded true by default (nothing stored says otherwise), but that must
    // not translate into an `enabled` key at all.
    const draft = buildBannerDraft(null, true, false, blankFields);
    expect('enabled' in draft).toBe(false);
    expect(draft.enabled).toBeUndefined();

    // Behavioural check: resolveBanner must not render anything for this
    // account after the save — no generic-headline band over a gradient.
    const config = { widget: { banner: draft } };
    expect(resolveBanner(config, 'widget', { brandName: 'מותג לדוגמה' })).toBeNull();
  });

  it('writing real headline content (no reels, no stored enabled key) still renders via the resolver\'s third state, without this helper forcing enabled:true', () => {
    const fields: BannerDraftFields = { ...blankFields, headline: 'שאלו אותי הכל' };
    const draft = buildBannerDraft(null, true, false, fields);
    expect('enabled' in draft).toBe(false);

    const config = { widget: { banner: draft } };
    const resolved = resolveBanner(config, 'widget', { brandName: 'מותג לדוגמה' });
    expect(resolved?.headline).toBe('שאלו אותי הכל');
  });

  it('toggled off manually on a reel-driven account actually suppresses the banner', () => {
    const draft = buildBannerDraft(null, /* bannerEnabled */ false, /* hasReels */ true, blankFields);
    expect(draft.enabled).toBe(false);
    const config = { widget: { banner: draft }, reels: [{ video: 'https://cdn.example.com/a.mp4', poster: null }] };
    expect(resolveBanner(config, 'widget', { brandName: 'מותג לדוגמה' })).toBeNull();
  });

  it('empty starterItems must be saved as null, never []', () => {
    // The JSDoc on BannerDraftFields.starterItems requires the "present but
    // empty" case to become null, not an empty array — resolveBanner (and
    // anything downstream) must be able to tell "no starters configured"
    // apart from "the customer emptied out a previously-filled list" only by
    // this key being absent-equivalent (null), never by inspecting length.
    const draft = buildBannerDraft(null, true, false, { ...blankFields, starterItems: [] });
    const starters = draft.starters as Record<string, unknown>;
    expect(starters.items).toBeNull();
  });

  it('a blank (or whitespace-only) startersLabel must be saved as null, never an empty string', () => {
    const draft = buildBannerDraft(null, true, false, { ...blankFields, startersLabel: '   ' });
    const starters = draft.starters as Record<string, unknown>;
    expect(starters.label).toBeNull();
  });

  it('maps eyebrow/subline/ctaLabel/ctaValue to their own keys, not a swapped neighbour', () => {
    // Every field gets a distinct, greppable value so a field-mapping swap
    // (e.g. subline reading from fields.eyebrow) shows up as a wrong value
    // rather than two fields coincidentally matching.
    const fields: BannerDraftFields = {
      eyebrow: 'EYEBROW_VALUE',
      headline: 'HEADLINE_VALUE',
      subline: 'SUBLINE_VALUE',
      ctaLabel: 'CTA_LABEL_VALUE',
      ctaValue: 'CTA_VALUE_VALUE',
      startersLabel: 'STARTERS_LABEL_VALUE',
      starterItems: ['item-1'],
    };
    const draft = buildBannerDraft(null, true, false, fields);

    expect(draft.eyebrow).toBe('EYEBROW_VALUE');
    expect(draft.headline).toBe('HEADLINE_VALUE');
    expect(draft.subline).toBe('SUBLINE_VALUE');

    const cta = draft.cta as { label?: string; value?: string };
    expect(cta.label).toBe('CTA_LABEL_VALUE');
    expect(cta.value).toBe('CTA_VALUE_VALUE');

    const starters = draft.starters as { label?: string; items?: unknown };
    expect(starters.label).toBe('STARTERS_LABEL_VALUE');
    expect(starters.items).toEqual(['item-1']);
  });
});
