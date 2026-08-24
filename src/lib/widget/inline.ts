/**
 * The inline mount — where, and in what shape, Bestie renders inside the
 * customer's own page.
 *
 * This module is the only place that decides what a stored `config.widget.inline`
 * means. `public/widget.js` receives the resolved object from
 * /api/widget/config and does no interpretation of its own, so a malformed
 * value can never reach a customer's DOM.
 */

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
  mode: InlineMountMode;
  preset: InlinePreset;
  surface: InlineTreatment;
  reserve: { desktop: number; mobile: number };
  theme: ResolvedInlineTheme;
  bubble: InlineBubble;
}

const MAX_SELECTOR = 200;
const MAX_RESERVE = 2000;

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

  const theme = raw.theme || {};
  return {
    enabled,
    selector,
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
      ground: theme.ground === 'light' ? 'light' : 'dark',
    },
    bubble: oneOf(raw.bubble, BUBBLES, 'after-scroll'),
  };
}
