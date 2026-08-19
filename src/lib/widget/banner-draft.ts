/**
 * Builds the `widget.banner` object the widget editor page posts on save.
 *
 * Pulled out of `page.tsx` (widget-editor) so the `enabled`-key logic below
 * — the thing a prior review found could be deleted with all 113 tests still
 * green — has a direct, non-UI test surface.
 *
 * `resolveBanner` (src/lib/widget/banner.ts) has three enable states:
 *   enabled: false  -> never render, no fallback
 *   enabled: true   -> render; headline falls back to a generic line
 *   enabled absent  -> render only if a headline actually resolves
 *
 * Two things must both hold here:
 *  1. An account that relies on the reel-driven auto-banner (no stored
 *     `widget.banner`, but `config.reels` populated — see resolveBanner's
 *     `hasReels` branch) must keep resolving to a visible video banner after
 *     ANY save through this page, even one that touches nothing banner-
 *     related. That fallback only fires while `widget.banner` is
 *     undefined/null; the moment this page writes an object there (which it
 *     always does), `enabled: true` has to be written explicitly or the
 *     video banner silently disappears on the next save.
 *  2. Nothing else may manufacture `enabled: true`. An account with no
 *     reels, no stored banner, and no typed banner content must save with
 *     the `enabled` key left OUT entirely, so the resolver's third state
 *     (render only if a headline resolves) survives — writing `true` there
 *     would make the generic fallback headline appear over a gradient that
 *     nobody asked for.
 */

export interface BannerDraftFields {
  eyebrow: string;
  headline: string;
  subline: string;
  ctaLabel: string;
  ctaValue: string;
  startersLabel: string;
  /**
   * Already trimmed and emptied of blank rows (pass the page's
   * `filledStarterItems`, not the raw per-input draft array) — same
   * "present-but-empty must become null, not []" contract bannerDraft always
   * had for this field.
   */
  starterItems: string[];
}

/**
 * @param currentBanner The STORED `config.widget.banner` (or null) — every
 *   field this page doesn't expose (e.g. `art`, `valueLine`) is preserved
 *   from here untouched, because /api/influencer/settings replaces
 *   `widget.banner` wholesale.
 * @param bannerEnabled The page's explicit on/off toggle, seeded from
 *   `currentBanner?.enabled !== false` and editable by the customer.
 * @param hasReels Whether the account currently has a selected reel
 *   rotation (drives the regression-protection branch above).
 */
export function buildBannerDraft(
  currentBanner: Record<string, unknown> | null | undefined,
  bannerEnabled: boolean,
  hasReels: boolean,
  fields: BannerDraftFields,
): Record<string, unknown> {
  const draft: Record<string, unknown> = {
    ...(currentBanner || {}),
    eyebrow: fields.eyebrow,
    headline: fields.headline,
    subline: fields.subline,
    cta: {
      ...((currentBanner?.cta as Record<string, unknown>) || {}),
      label: fields.ctaLabel,
      value: fields.ctaValue,
    },
    starters: {
      ...((currentBanner?.starters as Record<string, unknown>) || {}),
      label: fields.startersLabel.trim() || null,
      items: fields.starterItems.length ? fields.starterItems : null,
    },
  };

  const storedEnabledTrue = currentBanner?.enabled === true;

  if (!bannerEnabled) {
    // Explicit off always wins, whatever content sits underneath it — this
    // is the toggle's whole job, and the one thing that must silence a
    // banner regardless of the branches below.
    draft.enabled = false;
  } else if (storedEnabledTrue || hasReels) {
    // Either the account already had an explicit `enabled: true` (preserve
    // it), or it's reel-driven and needs the generic-fallback branch to keep
    // firing now that this page is about to write a real object into
    // `widget.banner` (see file header, point 1).
    draft.enabled = true;
  } else {
    // Nothing forces the generic fallback on. Leave the key out — real
    // `delete`, not merely `undefined`, so a stray `enabled: undefined` from
    // a spread source can't linger — so resolveBanner's third state decides
    // purely from whether a headline resolves (see file header, point 2).
    delete draft.enabled;
  }

  return draft;
}
