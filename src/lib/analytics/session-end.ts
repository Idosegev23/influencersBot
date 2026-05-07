/**
 * Session lifecycle tracker. Fires session_start once per chat surface
 * mount and session_end on idle timeout / tab hide / pagehide. Uses the
 * existing track() pipeline so the event lands in both GA4 and our DB.
 *
 * exit_kind classification:
 *   - 'idle_timeout'   no user activity for IDLE_TIMEOUT_MS
 *   - 'tab_hidden'     visibilitychange to hidden
 *   - 'pagehide'       browser tearing the page down
 */

import { track, getTimeInSession, endSession as endLocalSession, flushAnalytics } from './track';

const IDLE_TIMEOUT_MS = 30 * 1000;

export type ExitKind = 'idle_timeout' | 'tab_hidden' | 'pagehide' | 'manual';

interface State {
  active: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  ended: boolean;
  lastTab?: string;
}

const state: State = {
  active: false,
  idleTimer: null,
  ended: false,
};

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap | keyof WindowEventMap> = [
  'mousedown',
  'keydown',
  'touchstart',
  'pointerdown',
  'scroll',
  'visibilitychange',
];

export function startSessionTracker(opts: { lastTab?: string } = {}): void {
  if (typeof window === 'undefined') return;
  if (state.active) {
    if (opts.lastTab) state.lastTab = opts.lastTab;
    return;
  }
  state.active = true;
  state.ended = false;
  state.lastTab = opts.lastTab;

  const onActivity = () => bumpIdleTimer();
  for (const evt of ACTIVITY_EVENTS) {
    document.addEventListener(evt as string, onActivity, { passive: true });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onPageHide);

  bumpIdleTimer();
  track('session_start', {});
}

export function setSessionTab(tab: string): void {
  state.lastTab = tab;
}

export function endSessionTracker(reason: ExitKind = 'manual'): void {
  if (!state.active || state.ended) return;
  state.ended = true;
  state.active = false;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  const duration_sec = getTimeInSession();
  track('session_end', {
    duration_sec,
    exit_kind: reason,
    last_tab: state.lastTab,
  });
  endLocalSession();
  flushAnalytics();
}

function bumpIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => endSessionTracker('idle_timeout'), IDLE_TIMEOUT_MS);
}

function onVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    endSessionTracker('tab_hidden');
  }
}

function onPageHide() {
  endSessionTracker('pagehide');
}
