'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Save, Loader2, Check } from 'lucide-react';
import { fetchInfluencerByUsername } from '@/lib/influencer/client';
import {
  activeOverrides,
  resolveBanner,
  resolveInvitation,
  sanitizeOverrides,
  todayInIsrael,
  MAX_INVITATION,
  MAX_REELS,
  type ResolvedBanner,
  type BannerOverride,
} from '@/lib/widget/banner';
import { WidgetDraftPreview } from '@/components/influencer/WidgetDraftPreview';

// Caps mirrored from src/lib/widget/banner.ts (not exported there, so kept in
// sync with resolveBanner's own MAX_EYEBROW/MAX_HEADLINE/MAX_SUBLINE/CTA/label
// constants by hand). MAX_INVITATION *is* exported and imported above — the
// two invitation fields go through resolveInvitation, which is shared code,
// so that cap must never drift from banner.ts.
const MAX_EYEBROW = 32;
const MAX_HEADLINE = 70;
const MAX_SUBLINE = 110;
const MAX_CTA_LABEL = 32;
const MAX_CTA_VALUE = 200;
const MAX_STARTERS_LABEL = 40;
const MAX_STARTER_ITEM = 80;
const MAX_STARTER_ITEMS = 4;

/** One row of GET /api/influencer/reels — see that route for field meaning. */
interface ReelCandidate {
  shortcode: string;
  poster: string | null;
  /** null = never persisted (scripts/persist-reel-videos.ts hasn't run for it) — not selectable. */
  video: string | null;
  /**
   * Whether this shortcode is currently in config.reels. Informational only
   * — NOT used to seed or drive the picker's checked state (see
   * `selectedReels` below): that's what made an aged-out reel invisible in
   * the first place, since this flag only exists on rows the route already
   * decided to return.
   */
  selected: boolean;
  /**
   * True when there is no live `instagram_posts` row for this shortcode
   * (the underlying Instagram post was deleted, or similar) — the route
   * still returns a tile for it, built from the poster/video already stored
   * in config.reels, so a selected-but-orphaned reel can always be seen and
   * deselected rather than becoming a silent 5/5-with-only-4-checked dead
   * end.
   */
  postMissing: boolean;
}

/**
 * Widget editor — customer-facing control for `config.widget.banner` and the
 * launcher's invitation bubbles, with a live preview of the real widget (not
 * a re-implementation of it).
 *
 * Covers the banner's copy fields (eyebrow, headline, subline, CTA, starter
 * questions), the two invitation bubbles (`config.widget.teaser`/`tooltip`),
 * and which persisted reels play behind the banner (`config.reels`, account-
 * level rather than per-surface). Scheduled promotions remain separate
 * follow-on work. This page's job is: load the account, hold a draft, drive
 * the preview iframe on every change, and save through the shared
 * /api/influencer/settings endpoint.
 */
// Shared appearance for every text input on this page — pulled out once
// rather than repeated per field, matching the object Task 5 wrote inline
// for the headline input.
const inputStyle = {
  background: 'var(--dash-bar)',
  color: 'var(--dash-text)',
  border: '1px solid var(--dash-glass-border)',
} as const;

type OverrideBadge = 'active' | 'scheduled' | 'ended' | 'invalid';

const OVERRIDE_BADGE_LABEL: Record<OverrideBadge, string> = {
  active: 'פעיל עכשיו',
  scheduled: 'מתוזמן',
  ended: 'הסתיים',
  invalid: 'תאריכים לא תקינים',
};
const OVERRIDE_BADGE_STYLE: Record<OverrideBadge, { bg: string; fg: string }> = {
  active: { bg: '#DCFCE7', fg: '#15803D' },
  scheduled: { bg: '#DBEAFE', fg: '#1D4ED8' },
  ended: { bg: '#F3F4F6', fg: '#6B7280' },
  invalid: { bg: '#FEE2E2', fg: '#B91C1C' },
};

/**
 * `until` earlier than `from` — the one shape `sanitizeOverrides` rejects
 * outright (banner.ts: `if (from && until && until < from) continue;`),
 * dropping the whole row rather than storing it as "ended". Dragging the end
 * date backward past a start date that didn't move is the single most
 * natural way a customer tries to end a promotion early, so this is checked
 * client-side to block the save (with a visible reason) instead of letting
 * it silently vanish on the next reload.
 */
function overrideInvalidDateOrder(row: BannerOverride): boolean {
  return typeof row.from === 'string' && typeof row.until === 'string' && row.until < row.from;
}

/**
 * 'active' / 'scheduled' / 'ended' / 'invalid', computed with the same
 * `activeOverrides` the real resolvers use — not a reimplementation of the
 * date comparison. A single-entry, dates-untouched config is fed through it
 * so the inclusive-`until` and surface-matching rules apply exactly as they
 * do at render time (see `activeOverrides` in src/lib/widget/banner.ts:
 * `until === today` is still open, which is what a customer means by "until
 * Friday"). An inverted window short-circuits to 'invalid' before any of
 * that — activeOverrides has no opinion on a shape sanitizeOverrides would
 * reject entirely, so computing active/scheduled/ended for it would just be
 * a second, contradictory claim next to the inline error.
 */
function overrideBadgeState(row: BannerOverride): OverrideBadge {
  if (overrideInvalidDateOrder(row)) return 'invalid';
  const targetSurface = row.surface === 'chat' ? 'chat' : 'widget';
  const isActive = activeOverrides({ overrides: [row] }, targetSurface).length > 0;
  if (isActive) return 'active';
  const today = todayInIsrael();
  if (typeof row.until === 'string' && row.until < today) return 'ended';
  return 'scheduled';
}

/** Reads one of the untyped copy fields (they fall under BannerOverride's index signature). */
function overrideField(row: BannerOverride, field: 'eyebrow' | 'headline' | 'subline'): string {
  const v = (row as Record<string, unknown>)[field];
  return typeof v === 'string' ? v : '';
}

/**
 * Reads the override's starters object (same raw `{label, items}` shape as
 * the default banner's `starters` — see `resolveStarters` in banner.ts,
 * which both `resolveBanner` and `sanitizeOverrides` run this through). No
 * client-side trimming/null-collapsing here on purpose: the sanitiser (and,
 * for preview, `sanitizeOverrides` itself — see `previewConfig` below) is
 * what turns "both empty" into "no starters key at all", which is what
 * makes an empty override fall back to the default rather than replacing it
 * with nothing.
 */
function overrideStarters(row: BannerOverride): { label: string; items: string[] } {
  const raw = (row as Record<string, unknown>).starters;
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const label = typeof obj.label === 'string' ? obj.label : '';
  const items = Array.isArray(obj.items) ? obj.items.filter((i): i is string => typeof i === 'string') : [];
  return { label, items };
}
function overrideHasStartersContent(row: BannerOverride): boolean {
  const { label, items } = overrideStarters(row);
  return label.trim().length > 0 || items.some((i) => i.trim().length > 0);
}

const OVERRIDE_FIELD_LABELS: [key: 'eyebrow' | 'headline' | 'subline' | 'starters' | 'teaser' | 'tooltip', label: string][] = [
  ['eyebrow', 'תגית עילית'],
  ['headline', 'כותרת ראשית'],
  ['subline', 'שורת משנה'],
  ['starters', 'שאלות פתיחה'],
  ['teaser', 'בועה שמופיעה מעצמה'],
  ['tooltip', 'בועה ליד הכפתור הסגור'],
];

/** Which fields this row actually replaces — for the "מחליף: …" summary line. */
function overrideFieldLabels(row: BannerOverride): string[] {
  return OVERRIDE_FIELD_LABELS
    .filter(([key]) => {
      if (key === 'starters') return overrideHasStartersContent(row);
      const v = (row as Record<string, unknown>)[key];
      return typeof v === 'string' && v.trim().length > 0;
    })
    .map(([, label]) => label);
}

function overrideSurfaceLabel(surface: BannerOverride['surface']): string {
  if (surface === 'widget') return 'ווידג׳ט בלבד';
  if (surface === 'chat') return 'צ׳אט בלבד';
  return 'ווידג׳ט וצ׳אט';
}

function overrideWindowLabel(row: BannerOverride): string {
  return `${row.from || 'ללא תאריך התחלה'} – ${row.until || 'ללא תאריך סיום'}`;
}

function makeOverrideId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Backfills a stable `id` on any row loaded without one (legacy data written
 * before this page existed, or before Task 4's `sanitizeOverrides` started
 * persisting `id`). Without this, the list's React `key` falls back to array
 * index (page.tsx's row `.map`), which can misattribute focus/input state
 * across a mid-list add or remove. Order is untouched — only the `id` field
 * is added, in place, to rows that lack one.
 */
function withStableIds(rows: BannerOverride[]): BannerOverride[] {
  return rows.map((r) => (r.id ? r : { ...r, id: makeOverrideId() }));
}

export default function WidgetEditorPage() {
  const params = useParams();
  const username = params.username as string;

  const [accountId, setAccountId] = useState<string>('');
  const [brandName, setBrandName] = useState<string>('');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [eyebrow, setEyebrow] = useState('');
  const [headline, setHeadline] = useState('');
  const [subline, setSubline] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaValue, setCtaValue] = useState('');
  const [startersLabel, setStartersLabel] = useState('');
  const [starterItems, setStarterItems] = useState<string[]>([]);
  const [teaser, setTeaser] = useState('');
  const [tooltip, setTooltip] = useState('');
  // The candidate pool from GET /api/influencer/reels — what's shown/
  // clickable in the grid. Kept separate from `config` (unlike the banner
  // fields above) because this list has its own fetch/loading lifecycle,
  // independent of the account load. NOT the source of truth for what's
  // selected — see `selectedReels` below.
  const [reelCandidates, setReelCandidates] = useState<ReelCandidate[]>([]);
  const [reelsLoaded, setReelsLoaded] = useState(false);
  // The actual draft rotation — {video, poster} pairs, seeded RAW from
  // config.reels (see the load effect) and never keyed by shortcode. Keying
  // selection by shortcode against only the fetched candidate window would
  // silently drop a persisted reel from the saved rotation the moment it
  // aged out of the top-30-by-views candidate list (danielamit has exactly
  // this case: one of its 5 persisted reels ranks #50 by views) — the very
  // next unrelated save would shrink the account's rotation from 5 to 4
  // without the customer touching reel selection at all.
  const [selectedReels, setSelectedReels] = useState<{ video: string; poster: string | null }[]>([]);
  // The scheduled-promotion rows — seeded RAW from config.overrides (same
  // load moment as every other field on this page), edited directly (no
  // resolved-value layer to seed from, see Task 8 brief invariant 3: these
  // rows ARE the raw layer), and posted back as a top-level `overrides` key
  // on save (invariant 1 — not nested under `widget`). Order matters: later
  // entries win at render time (resolveBanner reduces the array in order),
  // so every mutation below (add/edit/remove) must preserve the order of
  // the rest of the array rather than re-sorting or rebuilding it.
  const [overridesDraft, setOverridesDraft] = useState<BannerOverride[]>([]);
  // Which row's "preview this promotion" control is active, or null. Forces
  // that one row into the preview regardless of its dates (Step 4) — see
  // `previewConfig` below for how the dates get ignored.
  const [previewingOverrideIndex, setPreviewingOverrideIndex] = useState<number | null>(null);
  // What a visitor sees RIGHT NOW — the resolved banner/invitation, including
  // any live scheduled override. Used only for placeholder text, never to
  // seed an input's value (see the load effect below for why).
  const [resolvedBanner, setResolvedBanner] = useState<ResolvedBanner | null>(null);
  const [resolvedInvitation, setResolvedInvitation] = useState<{ teaser: string | null; tooltip: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 'open' (default, unchanged banner preview) shows the chat panel, the
  // only way to see banner copy. 'teaser'/'tooltip' show the launcher
  // instead and ask widget.js to render exactly one bubble — the widget's
  // own mutual-exclusion logic means the teaser always wins if both were
  // asked to render at once (it has no empty-text bail and unconditionally
  // clears the tooltip), so each field gets its own view rather than
  // sharing a single "closed" state.
  const [previewView, setPreviewView] = useState<'open' | 'teaser' | 'tooltip'>('open');

  // Seeds every draft field from a STORED config — never from a resolver's
  // merged output (resolveBanner/resolveInvitation layer any currently
  // active scheduled override on top of the base, so seeding from them
  // would bake a temporary promotion's copy into the permanent config the
  // moment the customer saves an unrelated field). Used both on initial
  // load and — critically — after a successful save, where `rawConfig` is
  // what the server actually stored (post-sanitisation), not what this page
  // posted. Re-seeding from that response rather than trusting the posted
  // draft is what makes the page honest about a row `sanitizeOverrides`
  // rejected (e.g. an inverted date window): the row disappears from the
  // UI because it's actually gone, not because of an optimistic guess.
  function applyRawConfig(rawConfig: any, name: string) {
    setConfig(rawConfig);
    const rawBanner = rawConfig?.widget?.banner || null;
    setEyebrow(rawBanner?.eyebrow || '');
    setHeadline(rawBanner?.headline || '');
    setSubline(rawBanner?.subline || '');
    setCtaLabel(rawBanner?.cta?.label || '');
    setCtaValue(rawBanner?.cta?.value || '');
    setStartersLabel(rawBanner?.starters?.label || '');
    setStarterItems(rawBanner?.starters?.items || []);
    setTeaser(rawConfig?.widget?.teaser || '');
    setTooltip(rawConfig?.widget?.tooltip || '');
    // Account-level, not nested under `widget` — same field
    // scripts/persist-reel-videos.ts writes and resolveArt reads
    // (src/lib/widget/banner.ts). Raw, not resolved: reels have no
    // override/promotion layer, so this already IS the value a visitor
    // gets right now.
    //
    // NOT capped to MAX_REELS on seed — scripts/persist-reel-videos.ts's
    // --shortcodes= path is uncapped and writes straight to config.reels,
    // bypassing /api/influencer/settings' own MAX_REELS slice, so a
    // stored array CAN be over-cap. Seeding the full array and enforcing
    // the cap only when the customer ADDS a selection (toggleReel below)
    // means an over-cap account is visibly over-cap and removable down to
    // the limit here, rather than silently trimmed on the first save —
    // even a no-interaction one.
    const rawReels: unknown[] = Array.isArray(rawConfig?.reels) ? rawConfig.reels : [];
    const isReel = (r: unknown): r is { video: string; poster?: unknown } =>
      !!r && typeof r === 'object' && typeof (r as { video?: unknown }).video === 'string';
    setSelectedReels(
      rawReels
        .filter(isReel)
        .map((r) => ({ video: r.video, poster: typeof r.poster === 'string' ? r.poster : null })),
    );

    setResolvedBanner(resolveBanner(rawConfig, 'widget', { brandName: name }));
    setResolvedInvitation(resolveInvitation(rawConfig, 'widget'));

    // Raw, unresolved — same reasoning as selectedReels above: these rows
    // edit config.overrides directly, so there is no separate "resolved"
    // value to seed from. `withStableIds` backfills an `id` on any legacy
    // row that was stored without one, so the list's React key never falls
    // back to array index.
    const rawOverrides: unknown[] = Array.isArray(rawConfig?.overrides) ? rawConfig.overrides : [];
    setOverridesDraft(
      withStableIds(rawOverrides.filter((o): o is BannerOverride => !!o && typeof o === 'object')),
    );
    setPreviewingOverrideIndex(null);
  }

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const influencer = await fetchInfluencerByUsername(username);
        if (!influencer || cancelled) return;
        const rawConfig = (influencer as any)._rawConfig || {};
        const name = influencer.display_name || influencer.username || '';
        setAccountId(influencer.id);
        setBrandName(name);
        applyRawConfig(rawConfig, name);
      } catch (err) {
        console.error('[widget-editor] failed to load account:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  // Candidates to render as pickable tiles — independent of the account load
  // above (its own endpoint, its own loading lifecycle). This list only
  // drives what's shown/clickable; it is NOT the source of truth for what's
  // selected (see `selectedReels` above and its comment).
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/influencer/reels?username=${encodeURIComponent(username)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: ReelCandidate[] = Array.isArray(data.reels) ? data.reels : [];
        if (cancelled) return;
        setReelCandidates(list);
      } catch (err) {
        console.error('[widget-editor] failed to load reels:', err);
      } finally {
        if (!cancelled) setReelsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  function toggleReel(candidate: ReelCandidate) {
    if (!candidate.video) return; // not persisted yet — cannot play, cannot be selected
    const video = candidate.video;
    setSelectedReels((prev) => {
      if (prev.some((r) => r.video === video)) {
        return prev.filter((r) => r.video !== video);
      }
      if (prev.length >= MAX_REELS) return prev; // cap enforced — silently ignore, button is disabled anyway
      return [...prev, { video, poster: candidate.poster }];
    });
  }

  function addOverride() {
    setOverridesDraft((rows) => [...rows, { id: makeOverrideId(), surface: 'both' }]);
  }
  function updateOverrideField(index: number, patch: Partial<BannerOverride>) {
    setOverridesDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeOverride(index: number) {
    setOverridesDraft((rows) => rows.filter((_, i) => i !== index));
    setPreviewingOverrideIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) return null;
      return cur > index ? cur - 1 : cur;
    });
  }
  function togglePreviewOverride(index: number) {
    setPreviewingOverrideIndex((cur) => (cur === index ? null : index));
  }

  // Starter-question editing for one promotion row — same shape, same cap
  // (MAX_STARTER_ITEMS), same "empty means fall back to the default" intent
  // as the default banner's starters editor below. Unlike the default
  // fields' `filledStarterItems` (which trims/nulls client-side before
  // sending), these are left raw: `sanitizeOverrides` already runs every
  // override's `starters` through the same `resolveStarters` the default
  // banner uses at render time, so trimming/blank-filtering/null-collapsing
  // happens once, server-side, for both — and `previewConfig` below runs
  // drafts through `sanitizeOverrides` too, so the live preview matches.
  function overrideStartersPatch(row: BannerOverride, next: { label?: string; items?: string[] }): Partial<BannerOverride> {
    const cur = overrideStarters(row);
    return { starters: { label: next.label ?? cur.label, items: next.items ?? cur.items } };
  }
  function updateOverrideStartersLabel(index: number, value: string) {
    setOverridesDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...overrideStartersPatch(r, { label: value }) } : r)));
  }
  function addOverrideStarterItem(index: number) {
    setOverridesDraft((rows) => rows.map((r, i) => {
      if (i !== index) return r;
      const { items } = overrideStarters(r);
      if (items.length >= MAX_STARTER_ITEMS) return r;
      return { ...r, ...overrideStartersPatch(r, { items: [...items, ''] }) };
    }));
  }
  function updateOverrideStarterItem(index: number, itemIndex: number, value: string) {
    setOverridesDraft((rows) => rows.map((r, i) => {
      if (i !== index) return r;
      const { items } = overrideStarters(r);
      return { ...r, ...overrideStartersPatch(r, { items: items.map((it, j) => (j === itemIndex ? value : it)) }) };
    }));
  }
  function removeOverrideStarterItem(index: number, itemIndex: number) {
    setOverridesDraft((rows) => rows.map((r, i) => {
      if (i !== index) return r;
      const { items } = overrideStarters(r);
      return { ...r, ...overrideStartersPatch(r, { items: items.filter((_, j) => j !== itemIndex) }) };
    }));
  }

  // The list of starter questions the customer actually typed, trimmed and
  // emptied of blank rows. An empty result must be saved as `null`, never
  // `[]` — a present-but-empty list at the boundary reads as "the customer
  // wants zero starters" and suppresses the dynamic defaults, while `null`
  // means "unset, fall back to /api/widget/chips". Clearing every row must
  // restore the dynamic chips, not blank the section.
  const filledStarterItems = useMemo(
    () => starterItems.map((s) => s.trim()).filter(Boolean),
    [starterItems],
  );

  // The banner as it will be stored: whatever is already there, with every
  // editable field replaced by its current draft value. Preserving the rest
  // matters — /api/influencer/settings replaces `widget.banner` wholesale, so
  // dropping an existing field here (art, valueLine, anything this page
  // doesn't expose yet) would silently erase it on save.
  const currentBanner = config?.widget?.banner || null;
  const bannerDraft = useMemo(
    () => ({
      ...(currentBanner || {}),
      // Accounts with reels but no stored banner get one automatically —
      // resolveBanner's fallback fires only while `widget.banner` is
      // undefined/null. The moment this editor writes ANY object there
      // (which it always does, even with every field left blank), that
      // fallback stops applying unless `enabled` says so explicitly. Default
      // true so a reel-only account's banner keeps resolving after its first
      // save here; preserve an existing explicit `false` so a banner someone
      // deliberately turned off does not get silently resurrected.
      enabled: currentBanner?.enabled !== false,
      eyebrow,
      headline,
      subline,
      cta: { ...(currentBanner?.cta || {}), label: ctaLabel, value: ctaValue },
      starters: {
        ...(currentBanner?.starters || {}),
        label: startersLabel.trim() || null,
        items: filledStarterItems.length ? filledStarterItems : null,
      },
    }),
    [currentBanner, eyebrow, headline, subline, ctaLabel, ctaValue, startersLabel, filledStarterItems],
  );

  // Same layering the live widget goes through — the default banner PLUS
  // whatever scheduled override is active right now — so a headline edit
  // that a live promotion is covering shows exactly what production shows:
  // the override, not the edit. That mismatch is expected and is what the
  // notice below explains. `teaser`/`tooltip` live one level up from the
  // banner (`config.widget.teaser`/`tooltip`), which is why they're spread in
  // here rather than folded into bannerDraft.
  const previewConfig = useMemo(() => {
    if (!config) return null;
    // Normally the preview reflects the current draft of every row, exactly
    // as production will once the customer saves — a row inside its live
    // window shows up, one outside it doesn't, later rows win over earlier
    // ones (resolveBanner reduces in array order). "Preview this promotion"
    // (Step 4) is the one exception: it isolates a single row and strips its
    // dates so it always applies, regardless of whether its window is open
    // today — otherwise a promotion can only be checked on the day it goes
    // live, which is the day it's too late to fix a typo.
    //
    // Run through `sanitizeOverrides` — the same function the save path
    // uses — rather than passing the raw draft straight to resolveBanner.
    // Two reasons: (1) it's the single source of truth for "empty means
    // fall back to the default" (an override with a blank starters object
    // would otherwise whole-object-replace the base's real starters with
    // nothing, since resolveBanner's per-field merge is whole-object, not
    // deep — sanitizeOverrides is what drops the key entirely when there's
    // no content); (2) it means the preview shows exactly what would be
    // saved, including a row `sanitizeOverrides` would reject (e.g. an
    // inverted date window) simply vanishing — which matches reality, since
    // the save button is disabled for that row anyway (see
    // `hasInvalidOverrideDates` below).
    const overrides = previewingOverrideIndex !== null && overridesDraft[previewingOverrideIndex]
      ? sanitizeOverrides([{ ...overridesDraft[previewingOverrideIndex], from: undefined, until: undefined }])
      : sanitizeOverrides(overridesDraft);
    return {
      ...config,
      // Account-level, not nested under `widget` (resolveArt reads
      // config.reels directly — see src/lib/widget/banner.ts). `selectedReels`
      // is seeded synchronously with `config` itself in the load effect
      // above, so unlike the copy fields there's no separate fetch to wait
      // on here.
      reels: selectedReels,
      overrides,
      widget: { ...(config.widget || {}), banner: bannerDraft, teaser, tooltip },
    };
  }, [config, bannerDraft, teaser, tooltip, selectedReels, overridesDraft, previewingOverrideIndex]);

  const previewDraft = useMemo(() => {
    if (!previewConfig) return null;
    return {
      banner: resolveBanner(previewConfig, 'widget', { brandName }),
      invitation: resolveInvitation(previewConfig, 'widget'),
      primaryColor: config?.widget?.primaryColor || config?.theme?.colors?.primary || null,
    };
  }, [previewConfig, brandName, config]);

  const liveOverride = useMemo(() => {
    if (!config) return null;
    return activeOverrides(config, 'widget')[0] || null;
  }, [config]);

  // Blocks Save while any promotion row has `until` earlier than `from` —
  // sanitizeOverrides would otherwise drop that row entirely (not mark it
  // "ended") with no error surfaced anywhere. See overrideInvalidDateOrder.
  const hasInvalidOverrideDates = overridesDraft.some(overrideInvalidDateOrder);

  function addStarterItem() {
    setStarterItems((items) => (items.length >= MAX_STARTER_ITEMS ? items : [...items, '']));
  }
  function updateStarterItem(index: number, value: string) {
    setStarterItems((items) => items.map((it, i) => (i === index ? value : it)));
  }
  function removeStarterItem(index: number) {
    setStarterItems((items) => items.filter((_, i) => i !== index));
  }

  async function handleSave() {
    // Defense in depth — the Save button is already disabled for this case
    // (see hasInvalidOverrideDates), but handleSave itself must never post
    // a row sanitizeOverrides will silently drop.
    if (hasInvalidOverrideDates) {
      setError('יש לתקן תאריכים לא תקינים במבצעים למעלה (תאריך סיום לפני תאריך התחלה) לפני השמירה.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/influencer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          widget: { banner: bannerDraft, teaser, tooltip },
          // Always sent — `selectedReels` is seeded raw from config.reels at
          // load (same moment as every other field on this page), not from
          // the separate /api/influencer/reels candidate fetch, so there is
          // no "hasn't resolved yet" state to guard against here.
          reels: selectedReels,
          // Top-level sibling of `widget`/`reels`, not nested under `widget`
          // — /api/influencer/settings runs this through sanitizeOverrides,
          // which drops malformed dates and content-free rows rather than
          // storing them (see src/lib/widget/banner.ts).
          overrides: overridesDraft,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // The sanitiser is the authority on what actually got stored — a
        // row this page posted can still be dropped (malformed date,
        // content-free) or reshaped server-side. Re-seed every field from
        // the server's own response rather than optimistically writing back
        // the posted draft, so the page shows what exists, not what was
        // merely sent. Falls back to a fresh profile fetch if an older
        // deployment of the route hasn't started returning `config` yet.
        if (data?.config) {
          applyRawConfig(data.config, brandName);
        } else {
          try {
            const influencer = await fetchInfluencerByUsername(username);
            const rawConfig = (influencer as any)?._rawConfig || {};
            applyRawConfig(rawConfig, brandName);
          } catch (refetchErr) {
            console.error('[widget-editor] post-save refetch failed:', refetchErr);
          }
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'שמירה נכשלה');
      }
    } catch (err) {
      console.error('[widget-editor] save failed:', err);
      setError('שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center animate-slide-up" style={{ background: 'transparent' }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 animate-slide-up"
          style={{ borderColor: 'var(--color-primary)' }}
        ></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 animate-slide-up" style={{ background: 'transparent', color: 'var(--dash-text)' }}>
      <div className="max-w-6xl mx-auto space-y-6 animate-slide-up">
        <div>
          <h1 className="text-4xl font-bold" style={{ color: 'var(--dash-text)' }}>עורך הווידג׳ט</h1>
          <p className="mt-2" style={{ color: 'var(--dash-text-2)' }}>
            ערכו את מה שהווידג׳ט מציג ברגע הראשון, עם תצוגה מקדימה חיה של הווידג׳ט האמיתי.
          </p>
        </div>

        {liveOverride ? (
          <div className="mb-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: '#FFF4E5', color: '#7a4b00' }}>
            כרגע פעיל מבצע מתוזמן ({liveOverride.from || 'ללא תאריך התחלה'} – {liveOverride.until || 'ללא תאריך סיום'}) שמכסה חלק מהשדות למטה בתצוגה המקדימה ובווידג׳ט החי.
            השדות כאן עורכים את הבסיס — מה שיחזור להיות פעיל ברגע שהמבצע יסתיים. שמירה כאן לא משנה את המבצע עצמו.
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Form ── */}
          <div
            className="rounded-xl border p-6 space-y-4"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--dash-glass-border)' }}
          >
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                תגית עילית
              </label>
              <input
                type="text"
                value={eyebrow}
                onChange={(e) => setEyebrow(e.target.value)}
                maxLength={MAX_EYEBROW}
                placeholder={resolvedBanner?.eyebrow || 'לדוגמה: חדש'}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                שורה קצרה מעל הכותרת. {eyebrow.length}/{MAX_EYEBROW} תווים.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                כותרת ראשית
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={MAX_HEADLINE}
                placeholder={resolvedBanner?.headline || 'היי, אני העוזר של המותג. שאלו אותי כל דבר.'}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                השורה הראשונה שהמבקר רואה כשהווידג׳ט נפתח. {headline.length}/{MAX_HEADLINE} תווים.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                שורת משנה
              </label>
              <input
                type="text"
                value={subline}
                onChange={(e) => setSubline(e.target.value)}
                maxLength={MAX_SUBLINE}
                placeholder={resolvedBanner?.subline || 'משפט קצר שמסביר מה אפשר לשאול'}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                {subline.length}/{MAX_SUBLINE} תווים.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  טקסט כפתור
                </label>
                <input
                  type="text"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  maxLength={MAX_CTA_LABEL}
                  placeholder={resolvedBanner?.cta?.label || 'לדוגמה: דברו איתי'}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {ctaLabel.length}/{MAX_CTA_LABEL} תווים.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  מה הכפתור עושה
                </label>
                <input
                  type="text"
                  value={ctaValue}
                  onChange={(e) => setCtaValue(e.target.value)}
                  maxLength={MAX_CTA_VALUE}
                  placeholder={resolvedBanner?.cta?.value || 'הטקסט שיוזן אוטומטית לתיבת הצ׳אט'}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {ctaValue.length}/{MAX_CTA_VALUE} תווים.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                כותרת לרשימת השאלות
              </label>
              <input
                type="text"
                value={startersLabel}
                onChange={(e) => setStartersLabel(e.target.value)}
                maxLength={MAX_STARTERS_LABEL}
                placeholder={resolvedBanner?.starters?.label || 'לדוגמה: שאלות נפוצות'}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                {startersLabel.length}/{MAX_STARTERS_LABEL} תווים.
              </p>
            </div>

            <div>
              <p className="text-xs text-[#655e51]">
                בלי שאלות משלכם, הוויג׳ט מציע שאלות שמתעדכנות לבד לפי התוכן שלכם.
                ברגע שתכתבו שאלות כאן, הן יוצגו כמו שהן ולא יתעדכנו.
              </p>
              <div className="space-y-2 mt-2">
                {starterItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => updateStarterItem(index, e.target.value)}
                      maxLength={MAX_STARTER_ITEM}
                      placeholder={`שאלה ${index + 1}`}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => removeStarterItem(index)}
                      className="px-3 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--dash-bar)', color: '#dc2626', border: '1px solid var(--dash-glass-border)' }}
                    >
                      הסרה
                    </button>
                  </div>
                ))}
              </div>
              {starterItems.length < MAX_STARTER_ITEMS ? (
                <button
                  type="button"
                  onClick={addStarterItem}
                  className="mt-2 text-xs font-medium"
                  style={{ color: 'var(--color-primary)' }}
                >
                  + הוספת שאלה
                </button>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                סרטוני רילס ברקע הווידג׳ט
              </label>
              {!reelsLoaded ? (
                <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>טוען סרטונים…</p>
              ) : reelCandidates.length === 0 ? (
                <p className="text-sm text-[#655e51]">
                  עוד לא הופקו סרטונים לחשבון הזה. אחרי הסריקה הבאה הם יופיעו כאן.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {reelCandidates.map((candidate) => {
                      const isSelected = !!candidate.video && selectedReels.some((r) => r.video === candidate.video);
                      const isPlayable = !!candidate.video;
                      const atCap = !isSelected && selectedReels.length >= MAX_REELS;
                      const disabled = !isPlayable || atCap;
                      return (
                        <button
                          key={candidate.shortcode}
                          type="button"
                          onClick={() => toggleReel(candidate)}
                          disabled={disabled}
                          title={
                            !isPlayable
                              ? 'הסרטון הזה עוד לא עובד לשידור — הוא יופיע כאן כשיהיה מוכן'
                              : candidate.postMissing
                              ? 'הפוסט המקורי כבר לא באינסטגרם, אבל הסרטון הזה עדיין מוצג בווידג׳ט'
                              : undefined
                          }
                          className="relative aspect-square rounded-lg overflow-hidden"
                          style={{
                            border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--dash-glass-border)',
                            opacity: isPlayable ? (atCap && !isSelected ? 0.5 : 1) : 0.35,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            background: 'var(--dash-bar)',
                          }}
                        >
                          {candidate.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={candidate.poster}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                          {isSelected ? (
                            <span
                              className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ background: 'var(--color-primary)', color: '#fff' }}
                            >
                              <Check className="w-3 h-3" />
                            </span>
                          ) : null}
                          {candidate.postMissing ? (
                            <span
                              className="absolute bottom-0 inset-x-0 text-center text-[9px] leading-tight px-0.5 py-0.5"
                              style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                            >
                              לא באינסטגרם
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-[#655e51] mt-2">
                    נבחרו {selectedReels.length} מתוך 5. הסרטונים מתחלפים בין מבקרים.
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  בועה שמופיעה מעצמה
                </label>
                <input
                  type="text"
                  value={teaser}
                  onChange={(e) => setTeaser(e.target.value)}
                  maxLength={MAX_INVITATION}
                  placeholder={resolvedInvitation?.teaser || 'לדוגמה: יש לי הנחה בשבילך 👋'}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {teaser.length}/{MAX_INVITATION} תווים.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dash-text)' }}>
                  בועה ליד הכפתור הסגור
                </label>
                <input
                  type="text"
                  value={tooltip}
                  onChange={(e) => setTooltip(e.target.value)}
                  maxLength={MAX_INVITATION}
                  placeholder={resolvedInvitation?.tooltip || 'לדוגמה: שאלו אותי כל דבר'}
                  className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                  {tooltip.length}/{MAX_INVITATION} תווים. שדה ריק יציג טקסט ברירת מחדל כללי.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t" style={{ borderColor: 'var(--dash-glass-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--dash-text)' }}>
                  מבצעים מתוזמנים
                </label>
                <button
                  type="button"
                  onClick={addOverride}
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-primary)' }}
                >
                  + הוספת מבצע
                </button>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--dash-text-3)' }}>
                כל שדה במבצע הוא זמני: הוא מחליף את הבסיס למעלה רק בין התאריכים
                שנבחרו, ואז חוזר לבד לברירת המחדל. שדה שנשאר ריק לא משנה כלום —
                אין צורך למלא הכול.
              </p>

              {overridesDraft.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--dash-text-3)' }}>אין מבצעים מתוזמנים.</p>
              ) : (
                <div className="space-y-3">
                  {overridesDraft.map((row, index) => {
                    const badge = overrideBadgeState(row);
                    const fieldLabels = overrideFieldLabels(row);
                    const isPreviewing = previewingOverrideIndex === index;
                    return (
                      <div
                        key={row.id || index}
                        className="rounded-lg border p-3"
                        style={{
                          borderColor: 'var(--dash-glass-border)',
                          background: 'var(--dash-bar)',
                          opacity: badge === 'ended' ? 0.55 : 1,
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                              style={{
                                background: OVERRIDE_BADGE_STYLE[badge].bg,
                                color: OVERRIDE_BADGE_STYLE[badge].fg,
                              }}
                            >
                              {OVERRIDE_BADGE_LABEL[badge]}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                              {overrideWindowLabel(row)}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--dash-text-3)' }}>
                              · {overrideSurfaceLabel(row.surface)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => togglePreviewOverride(index)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{
                                background: isPreviewing ? 'var(--color-primary)' : 'var(--dash-bar)',
                                color: isPreviewing ? '#fff' : 'var(--dash-text)',
                                border: '1px solid var(--dash-glass-border)',
                              }}
                            >
                              {isPreviewing ? 'מוצג בתצוגה המקדימה' : 'תצוגה מקדימה של המבצע'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOverride(index)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{ color: '#dc2626', border: '1px solid var(--dash-glass-border)' }}
                            >
                              הסרה
                            </button>
                          </div>
                        </div>

                        {fieldLabels.length > 0 ? (
                          <p className="text-xs mb-2" style={{ color: 'var(--dash-text-3)' }}>
                            מחליף: {fieldLabels.join(', ')}
                          </p>
                        ) : (
                          <p className="text-xs mb-2" style={{ color: 'var(--dash-text-3)' }}>
                            לא הוגדר שום שדה — המבצע לא ישנה כלום עד שיתמלא לפחות שדה אחד.
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              מתאריך
                            </label>
                            <input
                              type="date"
                              value={row.from || ''}
                              onChange={(e) => updateOverrideField(index, { from: e.target.value || undefined })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              עד תאריך
                            </label>
                            <input
                              type="date"
                              value={row.until || ''}
                              onChange={(e) => updateOverrideField(index, { until: e.target.value || undefined })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        {overrideInvalidDateOrder(row) ? (
                          <p className="text-xs mb-2" style={{ color: '#dc2626' }}>
                            תאריך הסיום קודם לתאריך ההתחלה — לא ניתן לשמור עד שהתאריכים יתוקנו.
                          </p>
                        ) : null}

                        <div className="mb-2">
                          <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                            איפה מוצג
                          </label>
                          <select
                            value={row.surface || 'both'}
                            onChange={(e) => updateOverrideField(index, { surface: e.target.value as BannerOverride['surface'] })}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                            style={inputStyle}
                          >
                            <option value="both">ווידג׳ט וצ׳אט</option>
                            <option value="widget">ווידג׳ט בלבד</option>
                            <option value="chat">צ׳אט בלבד</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              תגית עילית
                            </label>
                            <input
                              type="text"
                              value={overrideField(row, 'eyebrow')}
                              maxLength={MAX_EYEBROW}
                              placeholder="ללא שינוי"
                              onChange={(e) => updateOverrideField(index, { eyebrow: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              כותרת ראשית
                            </label>
                            <input
                              type="text"
                              value={overrideField(row, 'headline')}
                              maxLength={MAX_HEADLINE}
                              placeholder="ללא שינוי"
                              onChange={(e) => updateOverrideField(index, { headline: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              שורת משנה
                            </label>
                            <input
                              type="text"
                              value={overrideField(row, 'subline')}
                              maxLength={MAX_SUBLINE}
                              placeholder="ללא שינוי"
                              onChange={(e) => updateOverrideField(index, { subline: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              בועה שמופיעה מעצמה
                            </label>
                            <input
                              type="text"
                              value={row.teaser || ''}
                              maxLength={MAX_INVITATION}
                              placeholder="ללא שינוי"
                              onChange={(e) => updateOverrideField(index, { teaser: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                              בועה ליד הכפתור הסגור
                            </label>
                            <input
                              type="text"
                              value={row.tooltip || ''}
                              maxLength={MAX_INVITATION}
                              placeholder="ללא שינוי"
                              onChange={(e) => updateOverrideField(index, { tooltip: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="block text-xs mb-1" style={{ color: 'var(--dash-text-2)' }}>
                            כותרת לרשימת השאלות (במבצע)
                          </label>
                          <input
                            type="text"
                            value={overrideStarters(row).label}
                            maxLength={MAX_STARTERS_LABEL}
                            placeholder="ללא שינוי"
                            onChange={(e) => updateOverrideStartersLabel(index, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                            style={inputStyle}
                          />
                          <div className="space-y-2">
                            {overrideStarters(row).items.map((item, itemIndex) => (
                              <div key={itemIndex} className="flex gap-2">
                                <input
                                  type="text"
                                  value={item}
                                  maxLength={MAX_STARTER_ITEM}
                                  placeholder={`שאלה ${itemIndex + 1}`}
                                  onChange={(e) => updateOverrideStarterItem(index, itemIndex, e.target.value)}
                                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                                  style={inputStyle}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOverrideStarterItem(index, itemIndex)}
                                  className="px-3 rounded-lg text-xs font-medium"
                                  style={{ background: 'var(--dash-bar)', color: '#dc2626', border: '1px solid var(--dash-glass-border)' }}
                                >
                                  הסרה
                                </button>
                              </div>
                            ))}
                          </div>
                          {overrideStarters(row).items.length < MAX_STARTER_ITEMS ? (
                            <button
                              type="button"
                              onClick={() => addOverrideStarterItem(index)}
                              className="mt-2 text-xs font-medium"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              + הוספת שאלה
                            </button>
                          ) : null}
                          <p className="mt-1.5 text-xs" style={{ color: 'var(--dash-text-3)' }}>
                            ריק (גם כותרת וגם שאלות) = משאיר את שאלות ברירת המחדל כמו שהן.
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {hasInvalidOverrideDates ? (
              <p className="text-xs" style={{ color: '#dc2626' }}>
                יש לתקן תאריכים לא תקינים במבצעים למעלה (תאריך סיום לפני תאריך התחלה) לפני השמירה.
              </p>
            ) : null}

            {error ? (
              <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
            ) : null}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || hasInvalidOverrideDates}
                title={hasInvalidOverrideDates ? 'יש לתקן תאריכים לא תקינים במבצעים לפני השמירה' : undefined}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl"
                style={{ background: saved ? '#17A34A' : 'var(--color-primary)', color: '#fff' }}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saved ? 'נשמר!' : 'שמירה'}
              </button>
            </div>
          </div>

          {/* ── Live preview ── */}
          <div className="lg:sticky lg:top-6">
            <div className="flex justify-end gap-2 mb-2">
              <button
                type="button"
                onClick={() => setPreviewView('open')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'open' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'open' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                צ׳אט פתוח
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('teaser')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'teaser' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'teaser' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                בועת הזמנה
              </button>
              <button
                type="button"
                onClick={() => setPreviewView('tooltip')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: previewView === 'tooltip' ? 'var(--color-primary)' : 'var(--dash-bar)',
                  color: previewView === 'tooltip' ? '#fff' : 'var(--dash-text)',
                  border: '1px solid var(--dash-glass-border)',
                }}
              >
                טולטיפ
              </button>
            </div>
            {accountId && previewDraft ? (
              <WidgetDraftPreview accountId={accountId} draft={previewDraft} view={previewView} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
