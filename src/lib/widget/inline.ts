/**
 * The inline mount — where, and in what shape, Bestie renders inside the
 * customer's own page.
 *
 * This module is the only place that decides what a stored `config.widget.inline`
 * means. `public/widget.js` receives the resolved object from
 * /api/widget/config and does no interpretation of its own, so a malformed
 * value can never reach a customer's DOM.
 */

import { resolveBanner, type BannerContext, type ResolvedBanner } from './banner';

export type InlineEnabled = true | 'preview';
export type InlineMountMode = 'into' | 'replace' | 'overlay';
export type InlinePreset = 'hero' | 'bar';
export type InlineTreatment = 'bare' | 'glass' | 'solid';
export type InlineBubble = 'after-scroll' | 'always' | 'never';

export interface ResolvedInlineTheme {
  /** 'inherit' means: set no font-family at all and let the host page cascade in. */
  font: string;
  accent: string | null;
  radius: number | null;
  ground: 'light' | 'dark';
}

export interface ResolvedInlineMount {
  enabled: InlineEnabled;
  selector: string;
  /**
   * Path prefixes the mount is allowed on, or `null` for "every page".
   *
   * The script is site-wide; every real selector is page-specific. Without
   * this, a hero selector that only exists on the home page makes every other
   * pageview run a document-wide MutationObserver for 5s and then file an
   * `inline_mount_missing` diagnostic — a fault report for a condition that is
   * not a fault, which buries the real misses it exists to surface.
   *
   * Deliberately prefixes, not regexes or globs: a regex arriving from account
   * config is a foot-gun (catastrophic backtracking on the customer's own
   * page) and nothing in the pilot needs one.
   */
  paths: string[] | null;
  mode: InlineMountMode;
  preset: InlinePreset;
  surface: InlineTreatment;
  reserve: { desktop: number; mobile: number };
  theme: ResolvedInlineTheme;
  bubble: InlineBubble;
}

const MAX_SELECTOR = 200;
const MAX_RESERVE = 2000;
const MAX_PATHS = 20;
const MAX_PATH = 200;

/**
 * What we are willing to store, expressed as what we accept rather than what
 * we reject.
 *
 * A blocklist of dangerous spellings cannot be completed: `body`, `body,.foo`,
 * `:is(body)`, `:has(> body)`, `:root`, `*` and `body[title="a b"]` all
 * resolve to `<body>` or `<html>`, and any string-level parser that is not a
 * real CSS parser will keep missing new spellings — two rounds of patching
 * individual bypasses is what proved this. The picker (Task 2) emits an id or
 * a short class chain and nothing else, so that is the whole grammar we need
 * to allow.
 *
 * This is not the safety guarantee — `<body class="page">` plus `.page` would
 * pass here. The guarantee is `inlineTargetIsSafe` in `public/widget.js`,
 * which compares element identity against `document.documentElement` / body /
 * head once a DOM exists — the only place "what does this resolve to" can
 * actually be answered. This check exists to stop the obviously-wrong thing
 * from ever being stored, not to replace that one.
 */
const STORABLE_SELECTOR = /^(#[A-Za-z_][\w-]*|\.[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*){0,2})$/;

/**
 * A selector we refuse to store at all.
 *
 * `mode: "replace"` calls `parentNode.replaceChild`, so a selector resolving
 * to the document root, `body` or `head` deletes the customer's page — and
 * our own container with it. The widget refuses these at mount time too;
 * this stops one ever being saved.
 */
export function isUnsafeSelector(sel: string): boolean {
  const s = (sel || '').trim();
  return !STORABLE_SELECTOR.test(s);
}

/**
 * A selector we are willing to *propose*. The failure guarded against is not
 * injection but a selector that silently stops matching when the customer
 * republishes: builder-generated hashes and deep positional chains are
 * exactly the ones that do.
 *
 * This gates what the picker emits, not what the widget accepts — rejecting a
 * stored selector at read time would kill a mount that was working.
 */
export function isStableSelector(sel: string): boolean {
  if (!sel || sel.length > MAX_SELECTOR) return false;
  if ((sel.match(/:nth-child/g) || []).length > 1) return false;
  if (/\.(css|sc|w-node|jsx|emotion)-[0-9a-z]{4,}/i.test(sel)) return false;
  if (/\.[A-Za-z_-]*[0-9a-f]{8,}/.test(sel)) return false;
  return true;
}

const MODES: InlineMountMode[] = ['into', 'replace', 'overlay'];
const PRESETS: InlinePreset[] = ['hero', 'bar'];
const TREATMENTS: InlineTreatment[] = ['bare', 'glass', 'solid'];
const BUBBLES: InlineBubble[] = ['after-scroll', 'always', 'never'];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function hex(value: unknown): string | null {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)
    ? value
    : null;
}

/**
 * A capped list of non-empty path prefixes, or null.
 *
 * Null (absent, not an array, or an array with nothing usable in it) means
 * "every page" — which is exactly today's behavior, so an account already
 * configured without `paths`, or one whose `paths` is malformed, keeps
 * mounting rather than silently losing the feature.
 */
function pathPrefixes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_PATH) continue;
    out.push(trimmed);
    if (out.length >= MAX_PATHS) break;
  }
  return out.length ? out : null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * How many starter chips fit without pushing the input below the fold.
 * The rule from the design: the pill stays above the fold, the chips are
 * expendable.
 *
 * Paired with an identical ES5 copy in `public/widget.js` (that file ships
 * unbundled to browsers and cannot import this module) — keep both in sync.
 */
export function chipBudget(viewportWidth: number): number {
  if (viewportWidth >= 640) return 3;
  if (viewportWidth >= 360) return 2;
  return 0;
}

export function resolveInlineMount(config: any): ResolvedInlineMount | null {
  const raw = config?.widget?.inline;
  if (!raw || typeof raw !== 'object') return null;

  // Tri-state. `true` and 'preview' both mount; anything else does not, which
  // keeps "absent" and "off" on the same, safe side.
  const enabled: InlineEnabled | null =
    raw.enabled === true ? true : raw.enabled === 'preview' ? 'preview' : null;
  if (!enabled) return null;

  const selector = typeof raw.selector === 'string' ? raw.selector.trim() : '';
  if (!selector || selector.length > MAX_SELECTOR) return null;
  if (isUnsafeSelector(selector)) return null;

  const theme = raw.theme || {};
  return {
    enabled,
    selector,
    paths: pathPrefixes(raw.paths),
    mode: oneOf(raw.mode, MODES, 'into'),
    preset: oneOf(raw.preset, PRESETS, 'hero'),
    surface: oneOf(raw.surface, TREATMENTS, 'bare'),
    reserve: {
      desktop: clampNumber(raw.reserve?.desktop, 0, MAX_RESERVE, 0),
      mobile: clampNumber(raw.reserve?.mobile, 0, MAX_RESERVE, 0),
    },
    theme: {
      font: typeof theme.font === 'string' && theme.font ? theme.font : 'inherit',
      accent: hex(theme.accent),
      radius: theme.radius === null || theme.radius === undefined
        ? null
        : clampNumber(theme.radius, 0, 999, 0),
      // 'light' is the default on purpose, and it must stay the same default
      // `pickerSampleTheme` in public/widget.js falls back to: an unstyled page
      // is white, and a 'dark' proposal there is light text on white. Two
      // halves of one feature disagreeing about the same fallback is a trap
      // even while every real pick sends an explicit value.
      ground: theme.ground === 'dark' ? 'dark' : 'light',
    },
    bubble: oneOf(raw.bubble, BUBBLES, 'after-scroll'),
  };
}

export interface InlinePayload extends ResolvedInlineMount {
  /** null when the account has no banner copy — the host page supplies the headline. */
  banner: ResolvedBanner | null;
}

/**
 * What /api/widget/config sends to the browser for the inline surface: the
 * mount, plus the banner resolved for it (art already forced to `host`).
 */
export function buildInlinePayload(
  config: any,
  ctx: BannerContext = {},
  now: Date = new Date(),
): InlinePayload | null {
  const mount = resolveInlineMount(config);
  if (!mount) return null;
  return { ...mount, banner: resolveBanner(config, 'inline', ctx, now) };
}
