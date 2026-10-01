import { CLIENT_EVENT_TYPES, type InteractionEventInput } from './events';

const MAX_EVENTS = 20;
const MAX_LEN = 500;
const PAYLOAD_KEYS = ['url', 'path', 'title', 'referrer', 'target'] as const;
const ALLOWED = new Set<string>(CLIENT_EVENT_TYPES);
// interaction_events.session_id is a FK to chat_sessions: one junk id would fail the whole batch insert.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The browser may only report page views and link clicks, with a small, bounded payload. */
export function sanitizeClientEvents(raw: unknown): { events: InteractionEventInput[]; rejected: number } {
  if (!Array.isArray(raw)) return { events: [], rejected: 0 };
  const events: InteractionEventInput[] = [];
  let rejected = 0;
  for (const item of raw) {
    if (events.length >= MAX_EVENTS || !item || typeof item !== 'object' || !ALLOWED.has((item as any).type)) {
      rejected++;
      continue;
    }
    const src = ((item as any).payload ?? {}) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const k of PAYLOAD_KEYS) if (typeof src[k] === 'string') payload[k] = (src[k] as string).slice(0, MAX_LEN);
    const ev: InteractionEventInput = { type: (item as any).type, payload };
    const sid = (item as any).sessionId;
    if (typeof sid === 'string' && UUID_RE.test(sid)) ev.sessionId = sid;
    events.push(ev);
  }
  return { events, rejected };
}
