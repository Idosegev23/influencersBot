/**
 * Client-side queue + flush for analytics events that need to be persisted
 * to our DB (in addition to GA4/Meta/TikTok). Buffers events in memory and
 * sends them as batches to /api/analytics/track using navigator.sendBeacon
 * (no preflight, survives unload, fire-and-forget on errors).
 *
 * Allow-list lives in event-catalog.ts; events not on it are skipped. This
 * prevents firehose events (scroll_depth, viewport_focus, etc.) from
 * flooding the events table — those still go to GA4 only.
 */

import { isAllowedEvent } from './event-catalog';

const FLUSH_INTERVAL_MS = 3000;
const MAX_BATCH = 25;

interface QueuedEvent {
  name: string;
  ts: number;
  payload: Record<string, unknown>;
}

interface QueueState {
  accountId?: string;
  sessionId?: string | null;
  anonId?: string | null;
  events: QueuedEvent[];
  timer: ReturnType<typeof setTimeout> | null;
  unloadHooked: boolean;
}

const state: QueueState = {
  events: [],
  timer: null,
  unloadHooked: false,
};

export function configureDbBeacon(ctx: {
  accountId?: string;
  sessionId?: string | null;
  anonId?: string | null;
}): void {
  if (ctx.accountId !== undefined) state.accountId = ctx.accountId;
  if (ctx.sessionId !== undefined) state.sessionId = ctx.sessionId;
  if (ctx.anonId !== undefined) state.anonId = ctx.anonId;
  ensureUnloadHook();
}

export function enqueueDbEvent(name: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!isAllowedEvent(name)) return;
  state.events.push({ name, ts: Date.now(), payload });
  if (state.events.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (!state.timer) {
    state.timer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

export function flush(): void {
  if (typeof window === 'undefined') return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (!state.accountId || state.events.length === 0) return;

  const body = JSON.stringify({
    accountId: state.accountId,
    sessionId: state.sessionId || null,
    anonId: state.anonId || null,
    events: state.events.splice(0, state.events.length),
  });

  const url = '/api/analytics/track';
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (sent) return;
    }
  } catch {
    /* fall through to fetch */
  }

  // Fallback for browsers without sendBeacon or when beacon refuses.
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* fire-and-forget */
    });
  } catch {
    /* fire-and-forget */
  }
}

function ensureUnloadHook(): void {
  if (state.unloadHooked || typeof window === 'undefined') return;
  state.unloadHooked = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', () => flush());
}
