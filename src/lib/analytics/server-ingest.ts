/**
 * Shared server-side analytics ingest. Validates a batch, normalizes each
 * event, and bulk-inserts into the `events` table. Used by both the
 * same-origin `/api/analytics/track` and cross-origin `/api/analytics/widget`
 * routes — the only difference between them is auth and CORS.
 *
 * Validation is intentionally permissive in production: unknown event names
 * are dropped rather than rejecting the whole batch (so a client rolling out
 * a new event before the server allow-list is updated doesn't blow up).
 */

import { createClient } from '@/lib/supabase/server';
import { isAllowedEvent, eventCategory } from './event-catalog';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_RE = /^[a-zA-Z0-9_-]{4,64}$/;
const MAX_EVENTS_PER_BATCH = 50;
const MAX_PAYLOAD_BYTES = 4096;

export interface IngestEvent {
  name: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

export interface IngestBatch {
  accountId: string;
  sessionId?: string | null;
  anonId?: string | null;
  events: IngestEvent[];
}

export interface IngestStamps {
  surface: 'chat' | 'widget';
  userAgent?: string | null;
  ipHash?: string | null;
  country?: string | null;
  referrer?: string | null;
}

export interface IngestResult {
  ok: boolean;
  accepted: number;
  rejected: number;
  status: number;
  error?: string;
}

export interface ParseResult {
  ok: boolean;
  batch?: IngestBatch;
  error?: string;
}

/**
 * Parse and validate an incoming JSON batch. Returns the normalized
 * structure or a structured error.
 */
export function parseBatch(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body must be an object' };
  }
  const obj = raw as Record<string, unknown>;

  const accountId = obj.accountId;
  if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
    return { ok: false, error: 'accountId required (uuid)' };
  }

  let sessionId: string | null = null;
  if (obj.sessionId != null) {
    if (typeof obj.sessionId !== 'string' || !UUID_RE.test(obj.sessionId)) {
      return { ok: false, error: 'sessionId must be a uuid' };
    }
    sessionId = obj.sessionId;
  }

  let anonId: string | null = null;
  if (obj.anonId != null) {
    if (typeof obj.anonId !== 'string' || !ANON_RE.test(obj.anonId)) {
      return { ok: false, error: 'anonId malformed' };
    }
    anonId = obj.anonId;
  }

  if (!Array.isArray(obj.events) || obj.events.length === 0) {
    return { ok: false, error: 'events array required' };
  }
  if (obj.events.length > MAX_EVENTS_PER_BATCH) {
    return { ok: false, error: `events exceeds ${MAX_EVENTS_PER_BATCH}` };
  }

  const events: IngestEvent[] = [];
  for (const e of obj.events) {
    if (!e || typeof e !== 'object') continue;
    const ev = e as Record<string, unknown>;
    if (typeof ev.name !== 'string' || ev.name.length === 0 || ev.name.length > 64) continue;
    const payload = ev.payload && typeof ev.payload === 'object' ? (ev.payload as Record<string, unknown>) : {};
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) continue;
    const ts = typeof ev.ts === 'number' && Number.isFinite(ev.ts) ? ev.ts : undefined;
    events.push({ name: ev.name, ts, payload });
  }

  if (events.length === 0) {
    return { ok: false, error: 'no valid events' };
  }
  return { ok: true, batch: { accountId, sessionId, anonId, events } };
}

/**
 * Insert a parsed batch into the `events` table. Drops events whose names
 * aren't in the allow-list (logged in dev). Returns counts.
 */
export async function ingestBatch(batch: IngestBatch, stamps: IngestStamps): Promise<IngestResult> {
  const rows: Array<{
    type: string;
    category: string;
    account_id: string;
    session_id: string | null;
    mode: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    created_at: string;
  }> = [];

  let rejected = 0;
  for (const ev of batch.events) {
    if (!isAllowedEvent(ev.name)) {
      rejected++;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[analytics] dropping unknown event:', ev.name);
      }
      continue;
    }
    const ts = ev.ts ? new Date(ev.ts).toISOString() : new Date().toISOString();
    rows.push({
      type: ev.name,
      category: eventCategory(ev.name),
      account_id: batch.accountId,
      session_id: batch.sessionId,
      mode: stamps.surface,
      payload: ev.payload || {},
      metadata: {
        anonId: batch.anonId || undefined,
        userAgent: stamps.userAgent || undefined,
        ipHash: stamps.ipHash || undefined,
        country: stamps.country || undefined,
        referrer: stamps.referrer || undefined,
        source: stamps.surface,
      },
      created_at: ts,
    });
  }

  if (rows.length === 0) {
    return { ok: true, accepted: 0, rejected, status: 200 };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('events').insert(rows);
  if (error) {
    console.error('[analytics] insert failed:', error.message);
    return { ok: false, accepted: 0, rejected, status: 500, error: 'insert_failed' };
  }

  // Propagate session lifecycle events into chat_sessions columns so the
  // rollup can compute avg_duration_sec / exit_kind without re-reading
  // events.payload. Fire-and-forget: failures are logged but don't break
  // the ingest response.
  try {
    await propagateSessionLifecycle(rows, batch.sessionId);
  } catch (err) {
    console.warn('[analytics] propagateSessionLifecycle failed:', err);
  }

  return { ok: true, accepted: rows.length, rejected, status: 200 };
}

async function propagateSessionLifecycle(
  rows: Array<{ type: string; session_id: string | null; payload: Record<string, unknown>; created_at: string }>,
  sessionId: string | null
): Promise<void> {
  if (!sessionId) return;

  const tabChange = rows.find((r) => r.type === 'tab_changed' || r.type === 'tab_view');
  const sessionEnd = rows.find((r) => r.type === 'session_end');

  const update: Record<string, unknown> = {
    last_event_at: rows[rows.length - 1]?.created_at || new Date().toISOString(),
  };

  if (tabChange) {
    const tabId =
      (tabChange.payload?.to_tab as string) ||
      (tabChange.payload?.tab_id as string) ||
      undefined;
    if (tabId) update.last_tab = tabId;
  }

  if (sessionEnd) {
    const dur = Number((sessionEnd.payload as any)?.duration_sec);
    const exit = (sessionEnd.payload as any)?.exit_kind;
    update.ended_at = sessionEnd.created_at;
    if (Number.isFinite(dur) && dur >= 0) update.duration_sec = Math.round(dur);
    if (typeof exit === 'string') update.exit_kind = exit.slice(0, 32);
    if ((sessionEnd.payload as any)?.last_tab) update.last_tab = (sessionEnd.payload as any).last_tab;
  }

  const supabase = await createClient();
  await supabase.from('chat_sessions').update(update).eq('id', sessionId);
}

/**
 * Hash an IP address (one-way) for abuse detection. Uses the same salt as
 * /api/track/visit so the values can be cross-referenced.
 */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const crypto = await import('node:crypto');
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.IP_HASH_SALT || ''))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Pull the client IP from common forwarded headers. Returns null if absent.
 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip') || null;
}
