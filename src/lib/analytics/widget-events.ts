export const WIDGET_EVENT_TYPES = new Set<string>([
  'page_view','session_start','session_end',
  'scroll_depth','time_on_page','exit_intent','tab_visibility',
  'product_view','cart_state','cart_change','checkout_reached','purchase',
  'click','internal_nav','external_link_click',
  // existing funnel events also flow here now
  'widget_loaded','widget_opened','widget_closed','widget_message_sent','widget_message_received',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const MAX_EVENTS = 50;

export interface NormalizedRow {
  account_id: string; anon_id: string | null; session_id: string | null;
  event_uid: string | null; type: string; path: string | null;
  payload: Record<string, unknown>; created_at: string;
}

// Strip query string (may carry PII) — keep pathname only.
function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null;
  return p.split('?')[0].slice(0, 512);
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
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
    if (JSON.stringify(payload).length > 4096) { rejected++; continue; }
    const ts = typeof e.ts === 'number' && Number.isFinite(e.ts) ? new Date(e.ts).toISOString() : new Date().toISOString();
    rows.push({
      account_id: accountId, anon_id: anon, session_id: session,
      event_uid: typeof e.uid === 'string' ? e.uid.slice(0, 64) : null,
      type: e.type, path: cleanPath(e.path), payload, created_at: ts,
    });
  }
  return { rows, rejected };
}

export function bufferKey(): string { return 'wev:buf'; }
