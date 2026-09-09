import { describe, it, expect } from 'vitest';
import { decideBlockedPageAction } from '@/lib/widget/blocked-site';

const base = { hasCachedHtml: false, runId: null, runStatus: null, warmupAllowed: true } as const;

describe('decideBlockedPageAction', () => {
  it('starts a warm-up when nothing is cached and nothing is running', () => {
    expect(decideBlockedPageAction({ ...base })).toEqual({ kind: 'start-warmup' });
  });

  it('waits while a run is in flight', () => {
    expect(decideBlockedPageAction({ ...base, runId: 'r1', runStatus: 'running' }))
      .toEqual({ kind: 'warming' });
  });

  it('collects a finished run', () => {
    expect(decideBlockedPageAction({ ...base, runId: 'r1', runStatus: 'succeeded' }))
      .toEqual({ kind: 'serve-cached' });
  });

  it('serves the cache even while a run is still recorded as in flight', () => {
    // A stale lock must not park a second visitor on the waiting page when the
    // HTML is already available.
    expect(decideBlockedPageAction({ ...base, hasCachedHtml: true, runId: 'r1', runStatus: 'running' }))
      .toEqual({ kind: 'serve-cached' });
  });

  it('does NOT start another run after a failure — that is the billing loop guard', () => {
    // $0.07 a run: a permanently unreachable site must not re-trigger on every
    // page view. The recorded runId expires on its own TTL instead.
    expect(decideBlockedPageAction({ ...base, runId: 'r1', runStatus: 'failed' }))
      .toEqual({ kind: 'give-up' });
    expect(decideBlockedPageAction({ ...base, runId: 'r1', runStatus: null }))
      .toEqual({ kind: 'give-up' });
  });

  it('gives up when warm-up is not allowed — a sub-page, or no Apify token', () => {
    expect(decideBlockedPageAction({ ...base, warmupAllowed: false })).toEqual({ kind: 'give-up' });
  });

  it('still serves a cached page when warm-up is not allowed', () => {
    // Presence assertion beside the give-up cases: the gate must not throw away
    // HTML we already paid for.
    expect(decideBlockedPageAction({ ...base, hasCachedHtml: true, warmupAllowed: false }))
      .toEqual({ kind: 'serve-cached' });
  });
});
