/**
 * Redis + Apify plumbing behind `decideBlockedPageAction`.
 *
 * Kept apart from the decision logic so the ordering rules stay unit-testable
 * without a Redis or an Apify account. See `blocked-site.ts` for why this exists.
 */
import { redisGet, redisSet, redisSetNx, redisDel } from '@/lib/redis';
import { decideBlockedPageAction, type BlockedPageAction } from '@/lib/widget/blocked-site';

/** A demo does not need fresher than daily, and each refresh costs a run. */
const HTML_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long a recorded run blocks another one. Longer than a run takes (~112s
 * measured) so concurrent visitors share it, short enough that a site which
 * starts working again recovers by itself.
 */
const RUN_TTL_SECONDS = 30 * 60;

const htmlKey = (accountId: string) => `preview:blocked:html:${accountId}`;
const runKey = (accountId: string) => `preview:blocked:run:${accountId}`;

export interface WarmupResult {
  action: BlockedPageAction['kind'];
  /** Present only for 'serve-cached' once the HTML is actually in hand. */
  html?: string;
}

/**
 * Decide and act for a blocked homepage.
 *
 * `warmupAllowed` is the caller's gate: homepage only, and only when Apify is
 * configured. Everything here is best-effort — any failure degrades to
 * 'give-up', which the route renders as the widget backdrop.
 */
export async function resolveBlockedPage(
  accountId: string,
  targetUrl: string,
  warmupAllowed: boolean,
): Promise<WarmupResult> {
  let cached: string | null = null;
  let run: { runId: string; datasetId: string } | null = null;
  try {
    cached = await redisGet<string>(htmlKey(accountId));
    run = await redisGet<{ runId: string; datasetId: string }>(runKey(accountId));
  } catch {
    /* Redis down — fall through as if nothing were known. */
  }
  // A lock placeholder is a claim without a started run yet; treat it as in flight.
  const runId = run?.runId ?? null;

  let runStatus: 'running' | 'succeeded' | 'failed' | null = null;
  if (!cached && runId && warmupAllowed) {
    try {
      const { getApifyRunState } = await import('@/lib/pipeline/apify-crawl');
      runStatus = await getApifyRunState(runId);
    } catch {
      runStatus = null; // unreadable status is treated as failure by the decider
    }
  }

  const action = decideBlockedPageAction({
    hasCachedHtml: !!cached,
    runId,
    runStatus,
    warmupAllowed,
  });

  if (action.kind === 'serve-cached') {
    if (cached) return { action: 'serve-cached', html: cached };
    // The run finished but its dataset has not been read yet.
    const html = await collectFinishedRun(accountId, run!.datasetId);
    if (html) return { action: 'serve-cached', html };
    return { action: 'give-up' };
  }

  if (action.kind === 'start-warmup') {
    await startWarmup(accountId, targetUrl);
    return { action: 'warming' };
  }

  return { action: action.kind };
}

/** Read a finished run's HTML, cache it, and drop the run lock. */
async function collectFinishedRun(accountId: string, datasetId: string): Promise<string | null> {
  try {
    const { fetchApifyPages } = await import('@/lib/pipeline/apify-crawl');
    const pages = await fetchApifyPages(datasetId, 0, 1);
    const html = pages[0]?.html;
    if (!html) return null;
    await redisSet(htmlKey(accountId), html, HTML_TTL_SECONDS);
    await redisDel(runKey(accountId));
    return html;
  } catch {
    return null;
  }
}

/**
 * Start one run, under a lock so simultaneous visitors cannot each buy one.
 * The lock is taken BEFORE the run starts: losing the race means someone else
 * is already paying for it.
 */
async function startWarmup(accountId: string, targetUrl: string): Promise<void> {
  try {
    const claimed = await redisSetNx(runKey(accountId), JSON.stringify({ runId: '', datasetId: '' }), RUN_TTL_SECONDS);
    if (!claimed) return;
    const { startApifyCrawl } = await import('@/lib/pipeline/apify-crawl');
    const handle = await startApifyCrawl(targetUrl, 1, []);
    // Both ids: the dataset is what we read on completion, and looking it up
    // later would need an Apify call this module would otherwise not make.
    await redisSet(runKey(accountId), { runId: handle.runId, datasetId: handle.datasetId }, RUN_TTL_SECONDS);
  } catch {
    // Starting failed — release the lock so a later visit can retry rather than
    // sitting behind a placeholder for the full TTL.
    await redisDel(runKey(accountId)).catch(() => {});
  }
}
