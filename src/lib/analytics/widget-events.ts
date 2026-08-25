export const WIDGET_EVENT_TYPES = new Set<string>([
  'page_view','session_start','session_end',
  'scroll_depth','time_on_page','exit_intent','tab_visibility',
  'product_view','cart_state','cart_change','checkout_reached','purchase',
  'click','internal_nav','external_link_click',
  // existing funnel events also flow here now
  'widget_loaded','widget_opened','widget_closed','widget_message_sent','widget_message_received',
  // diagnostics (migration 078 / Task 4) — these ride the same buffer → drain →
  // partition path, so client errors inherit the 90-day retention for free.
  'client_error','config_load_failed','csp_blocked',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const MAX_EVENTS = 50;

export interface NormalizedRow {
  account_id: string; anon_id: string | null; session_id: string | null;
  event_uid: string | null; type: string; path: string | null;
  payload: Record<string, unknown>; created_at: string;
}

/**
 * Remove unpaired UTF-16 surrogates.
 *
 * A lone surrogate is legal JSON but is not a Unicode scalar value, so
 * Postgres refuses the text and PostgREST rejects the entire batch with
 * PGRST102 "Empty or invalid json". Because the drain deliberately leaves a
 * failed batch in the buffer, one such row halts the whole pipeline — which
 * is exactly what happened on 2026-08-19, costing six days of events and
 * filling the Redis list to Upstash's 100 MiB per-key ceiling.
 *
 * They arrive whenever the client truncates captured text at a fixed
 * character count and the cut lands between the two halves of an emoji.
 * `public/widget.js` now slices on whole code points, but it sits in
 * visitors' browser caches for weeks, so this is the boundary that actually
 * makes the row storable.
 *
 * Well-formed pairs are untouched: real emoji survive. Only the orphan goes.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripLoneSurrogates<T>(value: T): T {
  if (typeof value === 'string') return value.replace(LONE_SURROGATE, '') as unknown as T;
  if (Array.isArray(value)) return value.map(stripLoneSurrogates) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k.replace(LONE_SURROGATE, '')] = stripLoneSurrogates((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}

// Strip query string (may carry PII) — keep pathname only.
function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null;
  return p.split('?')[0].slice(0, 512).replace(LONE_SURROGATE, '');
}

export function normalizeWidgetEvents(
  raw: any,
  accountId: string,
): { rows: NormalizedRow[]; rejected: number } {
  const rows: NormalizedRow[] = [];
  let rejected = 0;
  const anon = typeof raw?.anonId === 'string' && ANON_RE.test(raw.anonId) ? raw.anonId : null;
  const session = typeof raw?.sessionId === 'string' && UUID_RE.test(raw.sessionId) ? raw.sessionId : null;
  const events = Array.isArray(raw?.events) ? raw.events.slice(0, MAX_EVENTS) : [];
  for (const e of events) {
    if (!e || typeof e.type !== 'string' || !WIDGET_EVENT_TYPES.has(e.type)) { rejected++; continue; }
    // Sanitise before measuring: stripping can only shrink, and an unstorable
    // row must never reach the buffer in the first place.
    const payload = stripLoneSurrogates(
      e.payload && typeof e.payload === 'object' ? e.payload : {},
    ) as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 4096) { rejected++; continue; }
    // Clamp untrusted client clocks to a sane window. A skewed device (wrong
    // year) would otherwise route to a far-off partition; the DEFAULT partition
    // keeps that lossless, but clamping keeps timestamps meaningful and prevents
    // future-dated rows from landing in DEFAULT (which would block creating that
    // month's real partition later).
    const nowMs = Date.now();
    const clientTs = typeof e.ts === 'number' && Number.isFinite(e.ts) ? e.ts : nowMs;
    const inWindow = clientTs >= nowMs - 90 * 86400000 && clientTs <= nowMs + 3600000;
    const ts = new Date(inWindow ? clientTs : nowMs).toISOString();
    rows.push({
      account_id: accountId, anon_id: anon, session_id: session,
      event_uid: typeof e.uid === 'string' ? e.uid.slice(0, 64).replace(LONE_SURROGATE, '') : null,
      type: e.type, path: cleanPath(e.path), payload, created_at: ts,
    });
  }
  return { rows, rejected };
}

export function bufferKey(): string { return 'wev:buf'; }
