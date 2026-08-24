/**
 * Widget/chat banner — the opening surface a visitor sees before they type.
 *
 * One schema, two surfaces. `config.widget.banner` drives the embedded widget;
 * `config.chat.banner` drives /chat/[username] and falls back to the widget's
 * banner as a WHOLE OBJECT when absent. Field-by-field merging is deliberately
 * not supported: a headline from one surface next to art from the other is a
 * state nobody can debug from the manage page.
 *
 * Both renderers (public/widget.js and components/chat/BannerHero.tsx) consume
 * the resolved shape this module returns, so the fallback ladder lives in one
 * place instead of being re-derived per surface.
 */

export type BannerSurface = 'widget' | 'chat' | 'inline';
export type BannerArtMode = 'gradient' | 'image' | 'video' | 'host';
export type BannerCtaAction = 'prefill' | 'url' | 'none';

export interface BannerReel {
  /** Public storage URL of a persisted mp4. Instagram CDN URLs expire. */
  video: string;
  /** First-frame image shown before the video decodes; may be absent. */
  poster: string | null;
}

export interface ResolvedBannerArt {
  mode: BannerArtMode;
  /** Non-null only in `image` mode. */
  image: string | null;
  /**
   * Non-null only in `video` mode. The full rotation — the renderer picks one
   * per visit, so this module stays pure and testable.
   */
  reels: BannerReel[] | null;
  /** Always populated — the scrim behind an image or video needs a color too. */
  from: string;
  to: string;
}

export interface ResolvedBannerCta {
  label: string;
  action: BannerCtaAction;
  /** Text to inject into the input (`prefill`) or the destination (`url`). */
  value: string | null;
}

export interface ResolvedBannerStarters {
  label: string | null;
  /** null → keep using the dynamic chips from /api/widget/chips. */
  items: string[] | null;
}

export interface ResolvedBanner {
  eyebrow: string | null;
  headline: string;
  subline: string | null;
  /** Widget-only: the line under the brand name. The chat header has no such slot. */
  valueLine: string | null;
  cta: ResolvedBannerCta | null;
  art: ResolvedBannerArt;
  starters: ResolvedBannerStarters | null;
}

export interface BannerContext {
  brandName?: string | null;
  /** Chat only — `config.greeting_message`, which already IS the headline. */
  greeting?: string | null;
  /** Chat only — `config.chat_subtitle`. */
  subtitle?: string | null;
}

const MAX_EYEBROW = 32;
const MAX_HEADLINE = 70;
const MAX_SUBLINE = 110;
const MAX_STARTERS = 4;
/** Rotation cap. Each reel is a few MB of stored mp4 and a config payload row. */
export const MAX_REELS = 5;
/** Bestie's brand purple — the same value `--color-primary` carries in globals.css. */
export const BESTIE_PRIMARY = '#9334EB';

/** Trim, treat whitespace-only as absent, and cap so long copy can't break the layout. */
function copy(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Three HSL stops derived from the account's brand color, clamped so that
 * washed-out and near-black brands still read as a gradient rather than a
 * grey smear. Port of `glowStops()` in public/widget.js — that copy stays
 * inline because widget.js is a standalone IIFE that cannot import. Keep the
 * two in sync; the clamps are what make a default banner viable for every
 * account without anyone uploading art.
 */
export function glowStops(primaryColor: string | null | undefined): [string, string, string] {
  let hex = String(primaryColor || '').trim().replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];

  let h = 265;
  let s = 0.9;
  let l = 0.68;

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    l = (max + min) / 2;
    if (d === 0) {
      h = 265;
      s = 0.9;
    } else {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
  }

  const sPct = Math.round(Math.max(70, Math.min(95, s * 100)));
  const lPct = Math.round(Math.max(58, Math.min(76, l * 100)));
  const stop = (shift: number) => `hsl(${Math.round((h + shift + 360) % 360)} ${sPct}% ${lPct}%)`;
  return [stop(0), stop(-28), stop(26)];
}

function httpUrl(value: unknown, max: number): string | null {
  const raw = copy(value, max);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return raw;
}

function resolveReels(raw: unknown): BannerReel[] | null {
  if (!Array.isArray(raw)) return null;
  const reels: BannerReel[] = [];
  for (const item of raw) {
    const video = httpUrl((item as any)?.video, 2048);
    if (!video) continue; // a reel with no playable source is not a reel
    reels.push({ video, poster: httpUrl((item as any)?.poster, 2048) });
    if (reels.length >= MAX_REELS) break;
  }
  return reels.length ? reels : null;
}

function resolveArt(
  raw: any,
  widgetConfig: any,
  primaryColor: string | null,
  accountReels: unknown,
): ResolvedBannerArt {
  const stops = glowStops(primaryColor);
  const from = copy(raw?.from, 64) || stops[0];
  const to = copy(raw?.to, 64) || stops[1];
  const base = { image: null, reels: null, from, to };

  // Degrade downward — video → image → gradient — so a mode whose asset is
  // missing never leaves a 206px empty rectangle, which is exactly the failure
  // the banner exists to remove.
  //
  // Reels are read from `config.reels` (account level) as well as from the
  // banner's own art, and a persisted rotation turns video on by default. The
  // list is one property of the account, not of a surface: the same reels play
  // in the widget and on the chat page, so rolling this out is a matter of
  // populating one array rather than copying it into every banner. An explicit
  // `mode: 'image' | 'gradient'` still wins, which is how an account opts out.
  const reels = resolveReels(raw?.reels) || resolveReels(accountReels);
  const wantsStill = raw?.mode === 'image' || raw?.mode === 'gradient';
  if (reels && !wantsStill) {
    return { ...base, mode: 'video', reels };
  }

  const image = copy(raw?.image, 2048) || copy(widgetConfig?.coverImage, 2048);
  if ((raw?.mode === 'image' || raw?.mode === 'video') && image) {
    return { ...base, mode: 'image', image };
  }

  return { ...base, mode: 'gradient' };
}

function resolveCta(raw: any): ResolvedBannerCta | null {
  const label = copy(raw?.label, 32);
  if (!label) return null;

  const action: BannerCtaAction =
    raw?.action === 'url' ? 'url' : raw?.action === 'none' ? 'none' : 'prefill';

  if (action === 'none') return { label, action, value: null };

  const value = copy(raw?.value, action === 'url' ? 2048 : 200);
  // A button that fires nothing is worse than no button at all.
  if (!value) return null;

  if (action === 'url') {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  }

  return { label, action, value };
}

function resolveStarters(raw: any): ResolvedBannerStarters | null {
  if (!raw || typeof raw !== 'object') return null;
  const label = copy(raw.label, 40);
  const items = Array.isArray(raw.items)
    ? raw.items.map((i: unknown) => copy(i, 80)).filter(Boolean).slice(0, MAX_STARTERS)
    : null;
  if (!label && (!items || items.length === 0)) return null;
  return { label, items: items && items.length ? (items as string[]) : null };
}

export interface BannerOverride {
  id?: string;
  /** Inclusive ISO date (YYYY-MM-DD) in Asia/Jerusalem. Absent = no lower bound. */
  from?: string;
  /** Inclusive ISO date. Absent = no upper bound. */
  until?: string;
  surface?: BannerSurface | 'both';
  /** Invitation bubble copy, read by the widget rather than the banner. */
  teaser?: string;
  tooltip?: string;
  [field: string]: unknown;
}

/**
 * Today's date in Israel, as YYYY-MM-DD.
 *
 * Windows are dates, not instants: a promotion ending on the 31st ends when
 * the 31st ends in Israel. Comparing UTC would close it three hours early in
 * summer, and the failure is silent — the offer simply stops appearing.
 * `en-CA` is used because it formats as YYYY-MM-DD, which string-compares
 * correctly.
 */
export function todayInIsrael(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

/**
 * Whether an override's declared surface applies to the surface being
 * resolved. The inline surface has no overrides of its own — it has no
 * `chat.banner`-style slot to write one against — so it follows whatever was
 * written for the widget, the same way it follows the widget's banner.
 */
function surfaceMatches(want: BannerSurface, got: string | undefined): boolean {
  const target = got || 'both';
  if (target === 'both') return true;
  if (want === 'inline') return target === 'widget';
  return target === want;
}

/** The overrides whose window is open and whose surface matches. */
export function activeOverrides(
  config: any,
  surface: BannerSurface,
  now: Date = new Date(),
): BannerOverride[] {
  const list = Array.isArray(config?.overrides) ? config.overrides : [];
  const today = todayInIsrael(now);
  return list.filter((o: BannerOverride) => {
    if (!o || typeof o !== 'object') return false;
    if (!surfaceMatches(surface, o.surface)) return false;
    if (typeof o.from === 'string' && o.from > today) return false;
    if (typeof o.until === 'string' && o.until < today) return false;
    return true;
  });
}

const MAX_OVERRIDES = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar date in YYYY-MM-DD, not merely ten characters shaped like
 * one. The shape check alone admits '2026-13-45', which is then compared as a
 * string at render time and sorts above every real date — a promotion that
 * never ends. Re-serialising the parsed value catches both impossible fields
 * and silent overflow ('2026-02-30' becomes March 2nd).
 */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validate overrides on the way in. A malformed date is dropped rather than
 * stored, because an unparseable `until` reads as "no upper bound" at render
 * time — a promotion that never ends, with no error anywhere to explain it.
 */
export function sanitizeOverrides(input: unknown): BannerOverride[] {
  if (!Array.isArray(input)) return [];
  const out: BannerOverride[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;

    const from = isCalendarDate(o.from) ? o.from : undefined;
    const until = isCalendarDate(o.until) ? o.until : undefined;
    if (from && until && until < from) continue;

    const surface: BannerOverride['surface'] =
      o.surface === 'widget' || o.surface === 'chat' ? o.surface : 'both';

    const entry: BannerOverride = { surface };
    if (from) entry.from = from;
    if (until) entry.until = until;
    if (typeof o.id === 'string' && o.id.trim()) entry.id = o.id.trim().slice(0, 60);

    const eyebrow = copy(o.eyebrow, MAX_EYEBROW);
    const headline = copy(o.headline, MAX_HEADLINE);
    const subline = copy(o.subline, MAX_SUBLINE);
    const teaser = copy(o.teaser, MAX_INVITATION);
    const tooltip = copy(o.tooltip, MAX_INVITATION);
    if (eyebrow) entry.eyebrow = eyebrow;
    if (headline) entry.headline = headline;
    if (subline) entry.subline = subline;
    if (teaser) entry.teaser = teaser;
    if (tooltip) entry.tooltip = tooltip;

    const starters = resolveStarters(o.starters);
    if (starters) entry.starters = starters;

    const hasContent = eyebrow || headline || subline || teaser || tooltip || starters;
    if (!hasContent) continue;

    out.push(entry);
    if (out.length >= MAX_OVERRIDES) break;
  }
  return out;
}

export const MAX_INVITATION = 140;

export interface ResolvedInvitation {
  /** Proactive bubble copy. null = keep the locale default in widget.js. */
  teaser: string | null;
  /** Closed-launcher bubble copy. null = keep the locale default. */
  tooltip: string | null;
}

/**
 * The two bubbles shown beside a closed launcher. Kept out of ResolvedBanner
 * because they belong to the launcher rather than the panel, and the widget
 * needs them before any banner is on screen.
 */
export function resolveInvitation(
  config: any,
  surface: BannerSurface,
  now: Date = new Date(),
): ResolvedInvitation {
  const widgetConfig = config?.widget || {};
  let teaser = copy(widgetConfig.teaser, MAX_INVITATION);
  let tooltip = copy(widgetConfig.tooltip, MAX_INVITATION);

  for (const o of activeOverrides(config, surface, now)) {
    const t = copy(o.teaser, MAX_INVITATION);
    const p = copy(o.tooltip, MAX_INVITATION);
    if (t) teaser = t;
    if (p) tooltip = p;
  }
  return { teaser, tooltip };
}

/**
 * Resolve the banner for one surface, or null to keep today's behavior.
 *
 * The enable gate has three states, so that neither "enabled but blank" nor
 * "written but never switched on" can ship an empty band:
 *   - `enabled: false`          → never render, no fallback to the other surface
 *   - `enabled: true`           → render; headline falls back to a generic line
 *   - `enabled` absent          → render only if a headline resolves
 */
export function resolveBanner(
  config: any,
  surface: BannerSurface,
  ctx: BannerContext = {},
  now: Date = new Date(),
): ResolvedBanner | null {
  const widgetConfig = config?.widget || {};
  const own = surface === 'chat' ? config?.chat?.banner : widgetConfig.banner;
  // Chat inherits the widget's banner wholesale — but only when it has none of
  // its own. An explicit `chat.banner: { enabled: false }` is an opt-out, not a
  // reason to go looking for the widget's.
  const inherited = surface === 'chat' && (own === undefined || own === null) ? widgetConfig.banner : own;

  // An account with a persisted reel rotation gets a banner even if nobody
  // wrote one. This is what makes the rollout "every account that has reels"
  // rather than "every account someone remembered to configure": the rotation
  // is the switch, and the copy falls back to the generic headline below.
  // Accounts with no reels and no banner are untouched.
  const hasReels = !!resolveReels(config?.reels);
  const raw = (inherited === undefined || inherited === null) && hasReels ? { enabled: true } : inherited;

  // Overrides merge per field over whatever the surface resolved to. Unlike
  // the surface fallback above — which is whole-object on purpose — an
  // override answers "what changed for now", so a promotion that only
  // replaces the eyebrow must not blank the headline.
  const active = activeOverrides(config, surface, now);
  const merged = active.length
    ? active.reduce((acc: any, o: BannerOverride) => {
        const { id, from, until, surface: _s, teaser, tooltip, ...fields } = o;
        return { ...acc, ...fields };
      }, raw || {})
    : raw;

  if (!merged || typeof merged !== 'object') return null;
  if (merged.enabled === false) return null;

  const brandName = copy(ctx.brandName, 60);
  const greeting = surface === 'chat' ? copy(ctx.greeting, MAX_HEADLINE) : null;
  const subtitle = surface === 'chat' ? copy(ctx.subtitle, MAX_SUBLINE) : null;

  const written = copy(merged.headline, MAX_HEADLINE);
  const generic = merged.enabled === true
    ? `היי, אני העוזר של ${brandName || 'המותג'}. שאלו אותי כל דבר.`.slice(0, MAX_HEADLINE)
    : null;
  const headline = written || greeting || generic;
  if (!headline) return null;

  // Whose brand is this surface? The widget is embedded on the account's own
  // site, so it wears the account's colour. /chat/[username] is Bestie's page —
  // the account's `theme.colors` there is not a brand choice at all, it is a
  // preset auto-assigned from `influencer_type` (every food account got the
  // same orange), so letting it drive the page put an arbitrary colour on
  // Bestie's surface.
  const primaryColor = surface === 'chat'
    ? BESTIE_PRIMARY
    : (widgetConfig.primaryColor || config?.theme?.colors?.primary || null);

  const resolved: ResolvedBanner = {
    eyebrow: copy(merged.eyebrow, MAX_EYEBROW),
    headline,
    subline: copy(merged.subline, MAX_SUBLINE) || subtitle,
    valueLine: copy(merged.valueLine, MAX_SUBLINE),
    cta: resolveCta(merged.cta),
    art: resolveArt(merged.art, widgetConfig, primaryColor, config?.reels),
    starters: resolveStarters(merged.starters),
  };

  // The inline surface sits inside the customer's own layout. Whatever is
  // behind it — a Webflow background video, a photo, a gradient section — is
  // theirs and is already painted. Drawing our own art there would stack a
  // second autoplaying video on top of theirs.
  if (surface === 'inline') {
    resolved.art = { ...resolved.art, mode: 'host', image: null, reels: null };
  }

  return resolved;
}
