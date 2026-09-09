/**
 * Showing a demo for a site that blocks our server.
 *
 * rebar.co.il answers our production IP with 403 on every path (200 to an
 * ordinary home connection), so the live proxy fetch can never render it and the
 * demo falls back to the widget on a plain backdrop. There is no stored snapshot
 * to serve either: `persistPageHtml` keeps extracted TEXT, not the page.
 *
 * The one transport that gets through is the Apify browser crawl this codebase
 * already uses for bot-challenged sites during scans. Measured against rebar:
 * it returns the real homepage (53KB, correct title), takes ~112 seconds, and
 * costs about $0.07. Both numbers rule out doing it inside the request — hence
 * warm-up: kick a run, show a self-refreshing "preparing" page, cache the HTML.
 *
 * Scope is deliberately the HOMEPAGE ONLY. Every unique path would be another
 * $0.07 and another two-minute wait, and the homepage is what a demo link opens.
 */

export type BlockedPageAction =
  /** Serve this HTML — it came from a completed warm-up. */
  | { kind: 'serve-cached' }
  /** A run is in flight; show the waiting page and let it poll. */
  | { kind: 'warming' }
  /** Nothing running and nothing cached — start a run, then show the waiting page. */
  | { kind: 'start-warmup' }
  /** Warm-up is not possible or has failed; fall back to the widget backdrop. */
  | { kind: 'give-up' };

export interface BlockedPageState {
  hasCachedHtml: boolean;
  /** An in-flight or finished Apify run recorded for this account, if any. */
  runId: string | null;
  runStatus: 'running' | 'succeeded' | 'failed' | null;
  /** False when the path is not the homepage, or Apify is not configured. */
  warmupAllowed: boolean;
}

/**
 * What to do about a blocked page, given what we already know.
 *
 * Pure on purpose: the ordering here is the whole feature, and it is far easier
 * to get wrong than it looks (a finished-but-unread run must not restart, a
 * failed run must not loop for ever).
 */
export function decideBlockedPageAction(state: BlockedPageState): BlockedPageAction {
  // Cache wins over everything, including a run still recorded as in flight —
  // otherwise a second visitor during a stale lock would sit on the waiting page
  // while the HTML is right there.
  if (state.hasCachedHtml) return { kind: 'serve-cached' };

  if (!state.warmupAllowed) return { kind: 'give-up' };

  if (state.runId) {
    if (state.runStatus === 'running') return { kind: 'warming' };
    // Succeeded but nothing cached means the dataset still has to be read; the
    // caller does that and caches it, so treat it as ready to collect.
    if (state.runStatus === 'succeeded') return { kind: 'serve-cached' };
    // Failed, aborted, or a status we could not read: do NOT immediately start
    // another run. The recorded runId carries its own TTL, and letting it expire
    // is what stops a permanently-unreachable site from billing us in a loop.
    return { kind: 'give-up' };
  }

  return { kind: 'start-warmup' };
}
